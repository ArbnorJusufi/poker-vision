import { describe, expect, it } from 'vitest';
import { applyVariant, autoContrast, directionalSharpen, unsharpMask } from './imageOps';

const SIZE = 16;

function image(fn: (x: number, y: number) => number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const v = fn(x, y);
      data.set([v, v, v, 255], (y * SIZE + x) * 4);
    }
  }
  return data;
}
const red = (data: Uint8ClampedArray, x: number, y: number) => data[(y * SIZE + x) * 4];

describe('imageOps', () => {
  const edge = image((x) => (x < 8 ? 100 : 160));

  it('leaves flat areas unchanged when sharpening', () => {
    const out = unsharpMask(image(() => 120), SIZE, 2, 3);
    expect(red(out, 8, 8)).toBe(120);
  });

  it('increases contrast across an edge', () => {
    const out = unsharpMask(edge, SIZE, 1.5, 3);
    expect(red(out, 7, 8)).toBeLessThan(100);
    expect(red(out, 8, 8)).toBeGreaterThan(160);
  });

  it('sharpens only along the chosen direction', () => {
    const horizontal = directionalSharpen(edge, SIZE, true, 5, 2);
    const vertical = directionalSharpen(edge, SIZE, false, 5, 2);
    expect(red(horizontal, 8, 8)).toBeGreaterThan(160);
    expect(red(vertical, 8, 8)).toBe(160);
  });

  it('stretches a dull image to the full range', () => {
    const dull = image((x) => 100 + x * 4);
    const out = autoContrast(dull, SIZE, 0);
    expect(red(out, 0, 0)).toBe(0);
    expect(red(out, 15, 0)).toBe(255);
  });

  it('returns plain input untouched and always yields opaque pixels', () => {
    expect(applyVariant(edge, SIZE, 'plain')).toBe(edge);
    for (const variant of ['sharp1', 'sharp3', 'sharp5', 'sharpH', 'sharpV'] as const) {
      const out = applyVariant(edge, SIZE, variant);
      expect(out).toHaveLength(edge.length);
      expect(out[3]).toBe(255);
    }
  });
});
