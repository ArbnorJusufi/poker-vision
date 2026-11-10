import type { LiveMode, LiveSnapshot } from './recognition/liveScanner';

export type { LiveMode, LiveSnapshot };

export interface LiveScanOptions {
  /** The element (web) that contains the camera preview. */
  root: unknown;
  mode: LiveMode;
  onUpdate: (snapshot: LiveSnapshot) => void;
  onStatus?: (status: string) => void;
  onError?: (error: Error) => void;
}

export interface LiveScanHandle {
  stop(): void;
}

/**
 * Boundary between the camera UI and live card recognition. The camera screen
 * only knows this interface: swap `start` to plug in another model or a native
 * frame-processor without touching the UI.
 *
 * Live recognition currently exists for the web build (also installed on a
 * phone's home screen). Expo Go cannot run per-frame vision code, so there it
 * reports itself as unsupported and the camera falls back to capture-then-read.
 */
export const LiveScanService = {
  isSupported(): boolean {
    return typeof document !== 'undefined' && typeof HTMLVideoElement !== 'undefined';
  },
  async start(options: LiveScanOptions): Promise<LiveScanHandle | null> {
    if (!LiveScanService.isSupported() || !options.root) return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { startWebLive } = require('./recognition/webLive');
    return startWebLive({ ...options, root: options.root as HTMLElement }) as Promise<LiveScanHandle>;
  },
};
