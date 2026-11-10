import { PositionedCard } from '@/types/poker';
import { groupTable } from '@/utils/tableLayout';
import { LiveCard, LiveStatus, LiveTracker, liveCodes, liveStatus } from './live';
import { gridRegions, outsideSeededSpots } from './pipeline';
import { Variant } from './imageOps';
import { INPUT_SIZE, Detection, Region, codeToCard, decodeOutput, letterboxFor, rgbaToTensor } from './yolo';

/** Where frames come from. On the web this is the camera's <video> element. */
export interface FrameSource {
  size(): { width: number; height: number } | null;
  image(): CanvasImageSource | null;
  /** Changes whenever a new frame is available, so unchanged frames can be skipped. */
  frameId?(): number | string;
}

/** The neural network. Replace it (e.g. with a native model) without touching the camera UI. */
export interface LiveEngine {
  run(input: Float32Array): Promise<{ data: Float32Array; dims: readonly number[] }>;
}

export interface LiveRenderer {
  render(source: CanvasImageSource, region: Region, variant?: Variant): Uint8ClampedArray;
  dispose(): void;
}

export type LiveMode = { kind: 'cards'; expected: number } | { kind: 'table' };

export interface LiveSnapshot {
  cards: LiveCard[];
  /** Counter for `cards` mode; null in table mode. */
  status: LiveStatus | null;
  /** Number of recognised cards (green or yellow). */
  recognised: number;
  /** Table mode: players found if the cards form a valid board plus hands, else null. */
  table: { players: number } | null;
  /** Everything required is recognised and has stayed that way for a few scans. */
  stable: boolean;
  scans: number;
  /** Source-frame size the boxes are expressed in. */
  frame: { width: number; height: number };
  /** Milliseconds since any card was last in view. */
  emptyForMs: number;
}

export interface LiveScannerOptions {
  engine: LiveEngine;
  renderer: LiveRenderer;
  source: FrameSource;
  mode: LiveMode;
  onUpdate: (snapshot: LiveSnapshot) => void;
  onError?: (error: Error) => void;
  /** Reads cards whose rank and suit are printed apart. Used now and then while something is missing. */
  splitIndex?: (image: CanvasImageSource, size: { width: number; height: number }) => Promise<Detection[]>;
  /** Minimum rest between scans so the UI thread can breathe. */
  intervalMs?: number;
  now?: () => number;
  tracker?: LiveTracker;
}

const LIVE_THRESHOLD = 0.15;
const STABLE_SCANS = 2;
/** One scan in this many reads split-index cards (rank and suit printed apart). */
const SPLIT_EVERY = 3;
/** Split-index cards stay in view this long between their own scans. */
const SEED_LIFETIME_MS = 8000;
const NO_COVERAGE: Region = { x: 0, y: 0, width: 0, height: 0 };

/** What the tracker currently sees, used to zoom in where the cards are. */
export interface TrackedArea {
  /** Median corner-index height in source pixels. */
  cardSize: number;
  /** Bounding box of the tracked cards in source pixels: x1, y1, x2, y2. */
  box: [number, number, number, number];
}

/** Corner-index height, in the 640 px model input, at which the detector reads best. */
const TARGET_CORNER = 42;
const WINDOW_STRIDE = 0.6;

export function trackedArea(cards: LiveCard[]): TrackedArea | null {
  const seen = cards.filter((card) => card.state !== 'failed');
  if (!seen.length) return null;
  const sizes = seen.map((card) => card.box[3] - card.box[1]).sort((a, b) => a - b);
  return {
    cardSize: sizes[Math.floor(sizes.length / 2)],
    box: [
      Math.min(...seen.map((card) => card.box[0])),
      Math.min(...seen.map((card) => card.box[1])),
      Math.max(...seen.map((card) => card.box[2])),
      Math.max(...seen.map((card) => card.box[3])),
    ],
  };
}

/** Zoomed windows, sized so the measured cards reach the detector's preferred size, tiling just the card area. */
export function zoomWindows(width: number, height: number, area: TrackedArea): Region[] {
  const aspect = width / height;
  const wanted = (INPUT_SIZE * area.cardSize) / TARGET_CORNER;
  const windowWidth = Math.round(Math.min(width, Math.max(wanted, width * 0.3)));
  const windowHeight = Math.round(Math.min(height, windowWidth / aspect));
  const margin = area.cardSize * 2;
  const left = Math.max(0, area.box[0] - margin);
  const top = Math.max(0, area.box[1] - margin);
  const right = Math.min(width, area.box[2] + margin);
  const bottom = Math.min(height, area.box[3] + margin);
  const axis = (from: number, to: number, window: number, total: number) => {
    const count = Math.max(1, Math.ceil((to - from - window) / (window * WINDOW_STRIDE)) + 1);
    return Array.from({ length: count }, (_, index) => {
      const start = count === 1 ? (from + to - window) / 2 : from + (index * (to - from - window)) / (count - 1);
      return Math.round(Math.min(Math.max(0, start), total - window));
    });
  };
  const xs = axis(left, right, windowWidth, width);
  const ys = axis(top, bottom, windowHeight, height);
  return ys.flatMap((y) => xs.map((x) => ({ x, y, width: windowWidth, height: windowHeight })));
}

/**
 * Blurry or low-contrast video needs a sharper view of the same frame, so while
 * something is missing the scans alternate between the plain and enhanced
 * versions. Once everything is recognised, plain frames are enough.
 */
export function planVariant(mode: LiveMode, scan: number, complete: boolean): Variant {
  if (complete) return 'plain';
  const rotation: Variant[] = ['plain', 'sharp1'];
  return rotation[scan % rotation.length];
}

/** Which part of the frame to analyse on this scan. */
export function planRegion(
  mode: LiveMode,
  scan: number,
  width: number,
  height: number,
  complete: boolean,
  tracked: TrackedArea | null = null,
): Region {
  const full: Region = { x: 0, y: 0, width, height };
  if (mode.kind === 'table') {
    if (tracked) {
      const windows = zoomWindows(width, height, tracked);
      // The full frame stays in the rotation so cards that appear elsewhere are still found.
      const cycle = [...windows, full];
      return cycle[scan % cycle.length];
    }
    const windows = [full, ...gridRegions(width, height, 0.5)];
    return windows[scan % windows.length];
  }
  // Mostly the whole frame; every third scan, while cards are missing, a zoomed window for small or distant cards.
  if (!complete && scan % 3 === 2) {
    const windows = gridRegions(width, height, 0.6);
    return windows[Math.floor(scan / 3) % windows.length];
  }
  return full;
}

export class LiveScanner {
  private running = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private scans = 0;
  private stableScans = 0;
  private lastSignature = '';
  private lastFrame: number | string | undefined;
  private lastSeenAt: number;
  private readonly tracker: LiveTracker;
  private readonly now: () => number;
  private readonly intervalMs: number;
  private complete = false;
  private seed: Detection[] = [];
  private seedAt = 0;

  constructor(private readonly options: LiveScannerOptions) {
    this.tracker = options.tracker ?? new LiveTracker();
    this.now = options.now ?? (() => Date.now());
    this.intervalMs = options.intervalMs ?? 120;
    this.lastSeenAt = this.now();
  }

  get isRunning() {
    return this.running;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastSeenAt = this.now();
    this.schedule(0);
  }

  /** Stops scanning and releases the frame-processing resources. The model stays loaded. */
  stop() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.tracker.reset();
    this.options.renderer.dispose();
  }

  private schedule(delay: number) {
    if (!this.running) return;
    this.timer = setTimeout(() => void this.tick(), delay);
  }

  private async tick() {
    if (!this.running) return;
    const started = this.now();
    const { source, engine, renderer, mode } = this.options;
    try {
      const size = source.size();
      const image = source.image();
      const frameId = source.frameId?.();
      const fresh = frameId === undefined || frameId !== this.lastFrame;
      if (size && size.width > 0 && size.height > 0 && image && fresh) {
        this.lastFrame = frameId;
        const split = this.options.splitIndex;
        const seedKnown = this.seed.length > 0 && this.now() - this.seedAt < SEED_LIFETIME_MS;
        if (split && this.scans % SPLIT_EVERY === SPLIT_EVERY - 1 && (!this.complete || seedKnown)) {
          const found = await split(image, size);
          if (!this.running) return;
          this.seed = found;
          this.seedAt = this.now();
          if (found.length) {
            // Cards the standard reading cannot see are only judged by their own scans.
            this.tracker.update(found, this.now(), NO_COVERAGE);
            this.scans += 1;
            this.publish(size);
            this.schedule(Math.max(40, this.intervalMs - (this.now() - started)));
            return;
          }
        }
        const region = planRegion(mode, this.scans, size.width, size.height, this.complete, trackedArea(this.tracker.cards()));
        const input = rgbaToTensor(renderer.render(image, region, planVariant(mode, this.scans, this.complete)), INPUT_SIZE);
        const output = await engine.run(input);
        if (!this.running) return;
        const decoded = decodeOutput(
          output.data, output.dims[2], letterboxFor(region.width, region.height), region, LIVE_THRESHOLD,
        );
        const recent = this.seed.length > 0 && this.now() - this.seedAt < SEED_LIFETIME_MS ? this.seed : [];
        const detections = [...outsideSeededSpots(decoded, recent), ...recent];
        const full = region.width >= size.width && region.height >= size.height;
        this.tracker.update(detections, this.now(), full ? undefined : region);
        this.scans += 1;
        this.publish(size);
      }
    } catch (error) {
      if (!this.running) return;
      this.options.onError?.(error instanceof Error ? error : new Error(String(error)));
    }
    this.schedule(Math.max(40, this.intervalMs - (this.now() - started)));
  }

  private publish(frame: { width: number; height: number }) {
    const { mode } = this.options;
    const cards = this.tracker.cards();
    const status = mode.kind === 'cards' ? liveStatus(cards, mode.expected) : null;
    const recognised = cards.filter((card) => card.state !== 'failed').length;
    if (cards.length) this.lastSeenAt = this.now();

    const table = mode.kind === 'table' ? this.tableSummary(cards) : null;
    const complete = status ? status.complete : table !== null;
    this.complete = complete;
    const signature = liveCodes(cards).sort().join(',');
    this.stableScans = complete && signature === this.lastSignature ? this.stableScans + 1 : complete ? 1 : 0;
    this.lastSignature = signature;

    this.options.onUpdate({
      cards,
      status,
      recognised,
      table,
      stable: complete && this.stableScans >= STABLE_SCANS,
      scans: this.scans,
      frame,
      emptyForMs: this.now() - this.lastSeenAt,
    });
  }

  private tableSummary(cards: LiveCard[]): { players: number } | null {
    const positioned: PositionedCard[] = cards
      .filter((card) => card.state !== 'failed')
      .map((card) => ({
        code: card.code,
        card: codeToCard(card.code),
        confidence: card.confidence,
        x: (card.box[0] + card.box[2]) / 2,
        y: (card.box[1] + card.box[3]) / 2,
        size: card.box[3] - card.box[1],
      }));
    if (positioned.length < 7) return null;
    const layout = groupTable(positioned);
    return layout.ok && !layout.dropped.length ? { players: layout.players.length } : null;
  }
}
