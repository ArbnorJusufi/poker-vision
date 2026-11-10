import { useEffect, useRef, useState } from 'react';
import { LiveMode, LiveScanHandle, LiveScanService, LiveSnapshot } from '@/services/LiveScanService';

interface Options {
  /** Scan while true; everything is released when it turns false or the component unmounts. */
  active: boolean;
  /** Host element of the camera preview (a DOM node on the web). */
  rootRef: React.RefObject<unknown>;
  mode: LiveMode;
}

export interface LiveScanState {
  supported: boolean;
  snapshot: LiveSnapshot | null;
  /** Detector loading progress while the model is being prepared. */
  loading: string | null;
  error: string | null;
}

/**
 * Runs live recognition on the camera preview for as long as `active` is true.
 * Scanning starts as soon as the camera screen opens and stops, releasing the
 * frame-processing resources, when it closes.
 */
export function useLiveScan({ active, rootRef, mode }: Options): LiveScanState {
  const supported = LiveScanService.isSupported();
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const modeKey = mode.kind === 'cards' ? `cards:${mode.expected}` : 'table';
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    if (!active || !supported) return undefined;
    let cancelled = false;
    let handle: LiveScanHandle | null = null;
    setSnapshot(null);
    setError(null);
    setLoading('Loading card detector…');

    // The camera host mounts in the same commit; wait a tick for its ref.
    const timer = setTimeout(() => {
      LiveScanService.start({
        root: rootRef.current,
        mode: modeRef.current,
        onUpdate: (next) => {
          if (cancelled) return;
          setLoading(null);
          setSnapshot(next);
        },
        onStatus: (status) => !cancelled && setLoading(status),
        onError: (failure) => !cancelled && setError(failure.message),
      }).then((started) => {
        if (cancelled) started?.stop();
        else handle = started;
      });
    }, 50);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      handle?.stop();
      setSnapshot(null);
      setLoading(null);
    };
  }, [active, supported, modeKey, rootRef]);

  return { supported, snapshot, loading, error };
}
