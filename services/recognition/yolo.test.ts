import { describe, expect, it } from 'vitest';
import { detectCards } from './pipeline';
import {
  CARD_CODES, Detection, codeToCard, decodeOutput, letterboxFor, mergeByCode,
  nonMaxSuppression, rgbaToTensor, selectCards,
} from './yolo';

const det = (code: string, confidence: number, x: number): Detection => ({
  code, confidence, box: [x, 0, x + 10, 10],
});

function fakeOutput(anchors: number, hits: { anchor: number; cls: number; score: number; box: number[] }[]) {
  const out = new Float32Array((4 + 52) * anchors);
  for (const { anchor, cls, score, box } of hits) {
    box.forEach((value, i) => { out[i * anchors + anchor] = value; });
    out[(4 + cls) * anchors + anchor] = score;
  }
  return out;
}

describe('card codes', () => {
  it('has the 52 unique model classes', () => {
    expect(new Set(CARD_CODES).size).toBe(52);
  });
  it('maps codes to cards', () => {
    expect(codeToCard('10H')).toEqual({ rank: '10', suit: 'hearts' });
    expect(codeToCard('AS')).toEqual({ rank: 'A', suit: 'spades' });
    expect(CARD_CODES.every((code) => codeToCard(code).suit && codeToCard(code).rank)).toBe(true);
  });
});

describe('letterbox and tensor', () => {
  it('centres a wide image', () => {
    const lb = letterboxFor(1280, 640);
    expect(lb.scale).toBe(0.5);
    expect([lb.padX, lb.padY, lb.width, lb.height]).toEqual([0, 160, 640, 320]);
  });
  it('writes planar normalized RGB', () => {
    const rgba = new Uint8ClampedArray(2 * 2 * 4).fill(255);
    rgba[0] = 0;
    const tensor = rgbaToTensor(rgba, 2);
    expect(tensor[0]).toBe(0);
    expect(tensor[4]).toBe(1);
    expect(tensor).toHaveLength(12);
  });
});

describe('decodeOutput', () => {
  it('maps boxes back through the letterbox and region', () => {
    const lb = letterboxFor(1280, 640);
    const out = fakeOutput(4, [{ anchor: 2, cls: 3, score: 0.9, box: [320, 320, 40, 80] }]);
    const [d] = decodeOutput(out, 4, lb, { x: 100, y: 50, width: 1280, height: 640 }, 0.3);
    expect(d.code).toBe(CARD_CODES[3]);
    expect(d.confidence).toBeCloseTo(0.9);
    // x: (320 -/+ 20) / 0.5 = 600..680; y: (320 -/+ 40 - 160) / 0.5 = 240..400; then + region origin
    expect(d.box).toEqual([700, 290, 780, 450]);
  });
  it('drops detections under the threshold', () => {
    const out = fakeOutput(2, [{ anchor: 0, cls: 1, score: 0.2, box: [10, 10, 5, 5] }]);
    expect(decodeOutput(out, 2, letterboxFor(640, 640), { x: 0, y: 0, width: 640, height: 640 }, 0.3)).toEqual([]);
  });
});

describe('suppression and merging', () => {
  it('suppresses overlapping boxes keeping the most confident', () => {
    const kept = nonMaxSuppression([det('AS', 0.6, 0), det('AH', 0.9, 1), det('KD', 0.7, 100)]);
    expect(kept.map((d) => d.code)).toEqual(['AH', 'KD']);
  });
  it('merges both corners of one card', () => {
    const merged = mergeByCode([det('AS', 0.6, 0), det('AS', 0.9, 200), det('KD', 0.5, 50)]);
    expect(merged.find((d) => d.code === 'AS')?.confidence).toBe(0.9);
    expect(merged).toHaveLength(2);
  });
  it('keeps the most confident cards ordered left to right', () => {
    const picked = selectCards([det('2C', 0.4, 300), det('AS', 0.9, 200), det('KD', 0.8, 10), det('QD', 0.7, 100)], 3);
    expect(picked.map((d) => d.code)).toEqual(['KD', 'QD', 'AS']);
  });
});

