import { useCallback, useEffect, useRef, useState } from 'react';
import { AiReading, readCardsWithAi } from '@/services/ai';
import { AiRequest } from '@/services/ai/types';
import { useAiConnection } from './useAiConnection';

export type AiState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; reading: AiReading }
  | { status: 'error'; message: string };

/** Runs one "check with AI" request for a photo and tracks its progress. Cancels when the screen goes away. */
export function useAiReading(photoUri: string | null, request: AiRequest) {
  const connection = useAiConnection();
  const [state, setState] = useState<AiState>({ status: 'idle' });
  const controller = useRef<AbortController | null>(null);
  const requestKey = JSON.stringify(request);

  const cancel = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
  }, []);

  useEffect(() => {
    cancel();
    setState({ status: 'idle' });
    return cancel;
  }, [photoUri, requestKey, cancel]);

  const run = useCallback(async () => {
    if (!connection || !photoUri) return;
    cancel();
    const mine = new AbortController();
    controller.current = mine;
    setState({ status: 'loading' });
    try {
      const reading = await readCardsWithAi(connection, photoUri, JSON.parse(requestKey) as AiRequest, mine.signal);
      if (controller.current === mine) setState({ status: 'done', reading });
    } catch (error) {
      if (mine.signal.aborted) return;
      setState({ status: 'error', message: error instanceof Error ? error.message : 'The AI check failed.' });
    }
  }, [connection, photoUri, requestKey, cancel]);

  const stop = useCallback(() => {
    cancel();
    setState({ status: 'idle' });
  }, [cancel]);

  return { connection, state, run, stop };
}
