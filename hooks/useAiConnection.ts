import { useSyncExternalStore } from 'react';
import { getConnection, subscribeConnection } from '@/services/ai/storage';
import { AiConnection } from '@/services/ai/types';

export function useAiConnection(): AiConnection | null {
  return useSyncExternalStore(subscribeConnection, getConnection, () => null);
}
