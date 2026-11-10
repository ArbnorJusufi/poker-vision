import { createFrameRenderer } from './frameRenderer';
import { getInferenceBackend } from './inferenceBackend';
import { FrameSource, LiveEngine, LiveMode, LiveScanner, LiveSnapshot } from './liveScanner';

/**
 * Reads frames from the <video> element the camera renders inside `root`.
 *
 * Frames are counted with requestVideoFrameCallback where it exists. Whether a
 * browser reports new frames for a camera stream varies, so the frame id also
 * changes once a second: a stalled counter can delay a scan but never freeze
 * recognition.
 */
export function createVideoFrameSource(root: HTMLElement): FrameSource {
  let video: HTMLVideoElement | null = null;
  let watched: HTMLVideoElement | null = null;
  let frames = 0;

  const watch = (element: HTMLVideoElement) => {
    if (watched === element || typeof element.requestVideoFrameCallback !== 'function') return;
    watched = element;
    const tick = () => {
      frames += 1;
      if (watched === element && element.isConnected) element.requestVideoFrameCallback(tick);
    };
    element.requestVideoFrameCallback(tick);
  };

  const current = () => {
    if (!video || !video.isConnected) video = root.querySelector('video');
    if (video) watch(video);
    return video && video.readyState >= 2 && video.videoWidth > 0 ? video : null;
  };
  return {
    size: () => {
      const v = current();
      return v ? { width: v.videoWidth, height: v.videoHeight } : null;
    },
    image: () => current(),
    frameId: () => `${frames}:${Math.floor(Date.now() / 1000)}`,
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
