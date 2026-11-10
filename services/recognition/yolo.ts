import { Card, Rank, Suit } from '@/types/poker';

export const INPUT_SIZE = 640;

/** Class order of the bundled model (`model.classes.json`). */
export const CARD_CODES = [
  '10C', '10D', '10H', '10S', '2C', '2D', '2H', '2S', '3C', '3D', '3H', '3S', '4C', '4D', '4H', '4S',
  '5C', '5D', '5H', '5S', '6C', '6D', '6H', '6S', '7C', '7D', '7H', '7S', '8C', '8D', '8H', '8S',
  '9C', '9D', '9H', '9S', 'AC', 'AD', 'AH', 'AS', 'JC', 'JD', 'JH', 'JS', 'KC', 'KD', 'KH', 'KS',
  'QC', 'QD', 'QH', 'QS',
] as const;

export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Letterbox {
  scale: number;
  padX: number;
  padY: number;
  width: number;
  height: number;
}

export interface Detection {
  code: string;
  confidence: number;
  /** x1, y1, x2, y2 in source-image pixels. */
  box: [number, number, number, number];
}

const suitByCode: Record<string, Suit> = { C: 'clubs', D: 'diamonds', H: 'hearts', S: 'spades' };

export function codeToCard(code: string): Card {
  return { rank: code.slice(0, -1) as Rank, suit: suitByCode[code.slice(-1)] };
}

export function letterboxFor(width: number, height: number, size = INPUT_SIZE): Letterbox {
  const scale = Math.min(size / width, size / height);
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  return { scale, padX: Math.floor((size - w) / 2), padY: Math.floor((size - h) / 2), width: w, height: h };
}

/** Converts a size x size RGBA image into a normalized planar RGB float tensor. */
export function rgbaToTensor(rgba: ArrayLike<number>, size = INPUT_SIZE): Float32Array {
  const plane = size * size;
  const tensor = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i += 1) {
    tensor[i] = rgba[i * 4] / 255;
    tensor[plane + i] = rgba[i * 4 + 1] / 255;
    tensor[2 * plane + i] = rgba[i * 4 + 2] / 255;
  }
  return tensor;
}

/**
 * Decodes a YOLO output laid out as [4 + classes, anchors] (batch removed),
 * mapping boxes back to source-image coordinates of the region that was run.
 */
export function decodeOutput(
  output: ArrayLike<number>,
  anchors: number,
  letterbox: Letterbox,
  region: Region,
  confidenceThreshold: number,
): Detection[] {
  const classes = output.length / anchors - 4;
  const detections: Detection[] = [];
  for (let a = 0; a < anchors; a += 1) {
    let best = -1;
    let bestScore = confidenceThreshold;
    for (let c = 0; c < classes; c += 1) {
      const score = output[(4 + c) * anchors + a];
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (best < 0) continue;
    const cx = output[a];
    const cy = output[anchors + a];
    const w = output[2 * anchors + a];
    const h = output[3 * anchors + a];
    detections.push({
      code: CARD_CODES[best],
      confidence: bestScore,
      box: [
        region.x + (cx - w / 2 - letterbox.padX) / letterbox.scale,
        region.y + (cy - h / 2 - letterbox.padY) / letterbox.scale,
        region.x + (cx + w / 2 - letterbox.padX) / letterbox.scale,
        region.y + (cy + h / 2 - letterbox.padY) / letterbox.scale,
      ],
    });
  }
  return detections;
}

function iou(a: Detection['box'], b: Detection['box']): number {
  const w = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
  const h = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const inter = w * h;
  const union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter;
  return union > 0 ? inter / union : 0;
}

export function nonMaxSuppression(detections: Detection[], iouThreshold = 0.5): Detection[] {
  const sorted = [...detections].sort((a, b) => b.confidence - a.confidence);
  const kept: Detection[] = [];
  for (const detection of sorted) {
    if (kept.every((other) => iou(detection.box, other.box) <= iouThreshold)) kept.push(detection);
  }
  return kept;
}

/**
 * A physical card shows its index in two corners and a deck has no duplicates,
 * so detections of the same code are one card; keep the most confident.
 */
export function mergeByCode(detections: Detection[]): Detection[] {
  const best = new Map<string, Detection>();
  for (const detection of detections) {
    const current = best.get(detection.code);
    if (!current || detection.confidence > current.confidence) best.set(detection.code, detection);
  }
  return [...best.values()];
}

export function selectCards(detections: Detection[], expected: number): Detection[] {
  return [...detections]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, expected)
    .sort((a, b) => (a.box[0] + a.box[2]) - (b.box[0] + b.box[2]));
}

export function tileRegions(width: number, height: number): Region[] {
  const tileW = Math.round(width * 0.6);
  const tileH = Math.round(height * 0.6);
  const xs = [0, width - tileW];
  const ys = [0, height - tileH];
  const tiles = ys.flatMap((y) => xs.map((x) => ({ x, y, width: tileW, height: tileH })));
  tiles.push({
    x: Math.round((width - tileW) / 2), y: Math.round((height - tileH) / 2), width: tileW, height: tileH,
  });
  return tiles;
}
