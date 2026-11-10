import { Detection, Region, mergeByCode, nonMaxSuppression } from './yolo';

export type LiveState = 'confident' | 'uncertain' | 'failed';

/** Smoothed confidence at or above this is drawn green. */
export const LIVE_CONFIDENT = 0.6;
/** Between this and `LIVE_CONFIDENT` is yellow; below it (but still visible) is red. */
export const LIVE_UNCERTAIN = 0.35;
/** Below this a detection is treated as noise and not drawn. */
export const LIVE_MIN_DISPLAY = 0.2;

export interface LiveCard {
  code: string;
  confidence: number;
  /** x1, y1, x2, y2 in source-frame pixels. */
  box: [number, number, number, number];
  state: LiveState;
  /** In how many scans the card has been seen. */
  frames: number;
}

interface Track {
  code: string;
  confidence: number;
  box: [number, number, number, number];
  frames: number;
  misses: number;
  lastSeen: number;
}

export interface LiveTrackerOptions {
  /** Scans (that covered the card) without a sighting before it is dropped. */
  maxMisses?: number;
  /** Hard limit on how long an unseen card is kept, in ms. */
  maxAgeMs?: number;
  /** Sightings needed before a weak card is shown, to hide one-frame noise. */
  minFrames?: number;
  /** Weight of the newest reading when smoothing (0..1). */
  smoothing?: number;
}

const iou = (a: number[], b: number[]) => {
  const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
  const h = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  if (w <= 0 || h <= 0) return 0;
  const inter = w * h;
  return inter / ((a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter);
};

export function liveStateFor(confidence: number): LiveState {
  if (confidence >= LIVE_CONFIDENT) return 'confident';
  if (confidence >= LIVE_UNCERTAIN) return 'uncertain';
  return 'failed';
}

/**
 * Turns the stream of per-scan detections into steady on-screen cards: it
 * smooths confidence and position, keeps a card briefly when a scan misses it
 * and drops it once repeated scans that covered it no longer see it. Scans of a
 * zoomed window only count as misses for cards inside that window.
 */
export class LiveTracker {
  private tracks = new Map<string, Track>();
  private readonly maxMisses: number;
  private readonly maxAgeMs: number;
  private readonly minFrames: number;
  private readonly smoothing: number;

  constructor(options: LiveTrackerOptions = {}) {
    this.maxMisses = options.maxMisses ?? 3;
    this.maxAgeMs = options.maxAgeMs ?? 8000;
    this.minFrames = options.minFrames ?? 2;
    this.smoothing = options.smoothing ?? 0.5;
  }

  reset() {
    this.tracks.clear();
  }

  /** `scanned` is the part of the frame this scan looked at; omit for the whole frame. */
  update(detections: Detection[], now: number, scanned?: Region) {
    const seen = new Set<string>();
    for (const detection of mergeByCode(nonMaxSuppression(detections))) {
      seen.add(detection.code);
      const track = this.tracks.get(detection.code);
      if (track) {
        const a = this.smoothing;
        track.confidence = a * detection.confidence + (1 - a) * track.confidence;
        track.box = track.box.map((value, i) => value + (detection.box[i] - value) * 0.6) as Track['box'];
        track.frames += 1;
        track.misses = 0;
        track.lastSeen = now;
      } else {
        this.tracks.set(detection.code, {
          code: detection.code,
          confidence: detection.confidence,
          box: [...detection.box],
          frames: 1,
          misses: 0,
          lastSeen: now,
        });
      }
    }

    for (const [code, track] of this.tracks) {
      if (seen.has(code)) continue;
      const cx = (track.box[0] + track.box[2]) / 2;
      const cy = (track.box[1] + track.box[3]) / 2;
      const covered = !scanned
        || (cx >= scanned.x && cx <= scanned.x + scanned.width && cy >= scanned.y && cy <= scanned.y + scanned.height);
      if (covered) {
        track.misses += 1;
        track.confidence *= 0.85;
      }
      if (track.misses >= this.maxMisses || now - track.lastSeen > this.maxAgeMs) this.tracks.delete(code);
    }
  }

  /** Cards to draw, strongest first; overlapping duplicates of one spot collapse to the best reading. */
  cards(): LiveCard[] {
    const visible = [...this.tracks.values()]
      .filter((track) => track.confidence >= LIVE_MIN_DISPLAY && (track.frames >= this.minFrames || track.confidence >= LIVE_UNCERTAIN))
      .sort((a, b) => b.confidence - a.confidence);
    const kept: Track[] = [];
    for (const track of visible) if (kept.every((other) => iou(other.box, track.box) <= 0.5)) kept.push(track);
    return kept.map((track) => ({
      code: track.code,
      confidence: track.confidence,
      box: [...track.box] as LiveCard['box'],
      state: liveStateFor(track.confidence),
      frames: track.frames,
    }));
  }
}

export interface LiveStatus {
  /** Cards recognised well enough to count (green or yellow). */
  detected: number;
  expected: number;
  /** Boxes drawn red because the card could not be read. */
  unreadable: number;
  /** Recognised cards beyond what is expected. */
  extra: number;
  /** Exactly the expected number of recognised cards is in view. */
  complete: boolean;
}

export function liveStatus(cards: LiveCard[], expected: number): LiveStatus {
  const usable = cards.filter((card) => card.state !== 'failed').length;
  return {
    detected: usable,
    expected,
    unreadable: cards.length - usable,
    extra: Math.max(0, usable - expected),
    complete: usable === expected,
  };
}

/** Codes of the cards the live view currently trusts, strongest first. */
export function liveCodes(cards: LiveCard[]): string[] {
  return cards.filter((card) => card.state !== 'failed').map((card) => card.code);
}
