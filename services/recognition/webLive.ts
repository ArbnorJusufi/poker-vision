import { createFrameRenderer } from './frameRenderer';
import { getInferenceBackend } from './inferenceBackend';
import { FrameSource, LiveEngine, LiveMode, LiveScanner, LiveSnapshot } from './liveScanner';

/** Reads frames from the <video> element the camera renders inside `root`. */
export function createVideoFrameSource(root: HTMLElement): FrameSource {
  let video: HTMLVideoElement | null = null;
  const current = () => {
    if (!video || !video.isConnected) video = root.querySelector('video');
    return video && video.readyState >= 2 && video.videoWidth > 0 ? video : null;
  };
  return {
    size: () => {
      const v = current();
      return v ? { width: v.videoWidth, height: v.videoHeight } : null;
    },
    image: () => current(),
    frameId: () => current()?.currentTime ?? -1,
  };
}

export interface WebLiveOptions {
  root: HTMLElement;
  mode: LiveMode;
  onUpdate: (snapshot: LiveSnapshot) => void;
  onStatus?: (status: string) => void;
  onError?: (error: Error) => void;
}

export interface WebLiveHandle {
  stop(): void;
}

/** Starts continuous recognition of the camera preview. Resolves once the detector is loaded and scanning. */
export async function startWebLive(options: WebLiveOptions): Promise<WebLiveHandle> {
  const backend = getInferenceBackend();
  let cancelled = false;
  let scanner: LiveScanner | null = null;

  const ready = backend.load(options.onStatus);
  ready.then(() => {
    if (cancelled) return;
    const engine: LiveEngine = { run: (input) => backend.run(input) };
    scanner = new LiveScanner({
      engine,
      renderer: createFrameRenderer(),
      source: createVideoFrameSource(options.root),
      mode: options.mode,
      onUpdate: options.onUpdate,
      onError: options.onError,
    });
    scanner.start();
  }).catch((error) => {
    if (!cancelled) options.onError?.(error instanceof Error ? error : new Error(String(error)));
  });

  return {
    stop() {
      cancelled = true;
      scanner?.stop();
      scanner = null;
    },
  };
}
