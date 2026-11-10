import { describe, expect, it } from 'vitest';
import { Variant } from './imageOps';
import { PassRunner, detectCards, detectTable, gridRegions, positionedCards } from './pipeline';
import { Detection, Region } from './yolo';

const det = (code: string, confidence: number, x: number, y: number, size = 40): Detection => ({
  code, confidence, box: [x, y, x + size * 0.7, y + size],
});

const makeRunner = (rules: (region: Region, variant: Variant) => Detection[]) => {
  const calls: { region: Region; variant: Variant }[] = [];
  const run: PassRunner = async (region, variant) => {
    calls.push({ region, variant });
    return rules(region, variant);
  };
  return { run, calls };
};

describe('detectCards escalation', () => {
  it('stops after one pass when every card is clearly read', async () => {
    const { run, calls } = makeRunner(() => [det('AS', 0.9, 0, 0), det('KD', 0.8, 100, 0)]);
    const { detections } = await detectCards(run, 1000, 800, 2);
    expect(calls).toHaveLength(1);
    expect(detections.map((d) => d.code)).toEqual(['AS', 'KD']);
  });

  it('tries sharpened variants when the plain pass is weak', async () => {
    const { run, calls } = makeRunner((_, variant) =>
      variant === 'plain'
        ? [det('AS', 0.2, 0, 0), det('KD', 0.2, 100, 0)]
        : [det('AS', 0.8, 0, 0), det('KD', 0.7, 100, 0)]);
    const messages: string[] = [];
    const { detections } = await detectCards(run, 1000, 800, 2, (m) => messages.push(m));
    expect(calls.some((call) => call.variant !== 'plain')).toBe(true);
    expect(detections.every((d) => d.confidence >= 0.7)).toBe(true);
    expect(messages).toContain('Looking closer…');
  });

  it('reaches tiles when the full image finds nothing', async () => {
    const { run } = makeRunner((region) =>
      region.width < 1000 ? [det('QH', 0.9, region.x + 5, region.y + 5)] : []);
    const { detections } = await detectCards(run, 1000, 800, 1);
    expect(detections.map((d) => d.code)).toEqual(['QH']);
  });

  it('gives up with whatever it found after the last stage', async () => {
    const { run, calls } = makeRunner(() => [det('2C', 0.3, 0, 0)]);
    const { detections } = await detectCards(run, 1000, 800, 5);
    expect(detections).toHaveLength(1);
    expect(calls.length).toBeGreaterThan(10);
  });
});

describe('positionedCards', () => {
  it('uses the midpoint of the two corners of one card', () => {
    const [card] = positionedCards([det('AS', 0.9, 100, 100, 40), det('AS', 0.8, 160, 200, 40)]);
    expect(card.x).toBeCloseTo((100 + 28 / 2 + 160 + 28 / 2) / 2);
    expect(card.y).toBeCloseTo((100 + 20 + 200 + 20) / 2);
    expect(card.confidence).toBe(0.9);
  });

  it('keeps a single corner when only one was seen', () => {
    const [card] = positionedCards([det('7D', 0.6, 100, 100, 40)]);
    expect(card.x).toBeCloseTo(114);
    expect(card.size).toBe(40);
  });

  it('ignores weak detections and collapses duplicates of the same corner', () => {
    const cards = positionedCards([det('AS', 0.9, 100, 100), det('AS', 0.7, 101, 101), det('3C', 0.1, 400, 400)]);
    expect(cards.map((c) => c.code)).toEqual(['AS']);
  });
});

describe('detectTable', () => {
  const sevenCards = (region: Region): Detection[] => {
    const all = ['AS', 'KD', 'QH', 'JC', '10S', '2D', '3D'].map((code, i) => det(code, 0.8, 100 + i * 150, 300));
    return all.filter((d) => d.box[0] >= region.x && d.box[2] <= region.x + region.width);
  };

  it('scans the full image plus a grid and stops once enough cards are found', async () => {
    const { run, calls } = makeRunner(sevenCards);
    const { cards } = await detectTable(run, 1400, 800);
    expect(cards).toHaveLength(7);
    expect(calls).toHaveLength(10);
    expect(calls.every((c) => c.variant === 'plain')).toBe(true);
  });

  it('retries with enhanced images when too few cards are found', async () => {
    const { run, calls } = makeRunner((region, variant) => (variant === 'sharp3' ? sevenCards(region) : []));
    const { cards } = await detectTable(run, 1400, 800);
    expect(cards).toHaveLength(7);
    expect(calls.some((c) => c.variant === 'sharp3')).toBe(true);
  });
});

describe('gridRegions', () => {
  it('covers the image with overlapping tiles inside its bounds', () => {
    const regions = gridRegions(1000, 800, 3, 3, 0.5);
    expect(regions).toHaveLength(9);
    expect(regions[0]).toEqual({ x: 0, y: 0, width: 500, height: 400 });
    expect(regions[8]).toEqual({ x: 500, y: 400, width: 500, height: 400 });
  });
});
