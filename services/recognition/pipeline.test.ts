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

  it('collapses repeated sightings of the same corner from different passes', () => {
    const cards = positionedCards([det('AS', 0.9, 100, 100), det('AS', 0.7, 101, 101), det('AS', 0.5, 99, 102)]);
    expect(cards).toHaveLength(1);
  });

  it('votes across passes when the same corner is read differently', () => {
    const cards = positionedCards([
      det('8C', 0.45, 100, 100), det('8C', 0.4, 101, 100), det('10C', 0.46, 100, 101), det('AS', 0.9, 300, 100),
    ]);
    expect(cards.map((card) => card.code).sort()).toEqual(['8C', 'AS']);
  });

  describe('weak detections', () => {
    // A row of cards like a streamed table: corner index about 65 px tall.
    const row = [
      det('KC', 0.65, 70, 60, 65), det('JC', 0.56, 400, 60, 65), det('7S', 0.88, 500, 60, 65),
      det('AD', 0.21, 610, 60, 65), det('KH', 0.79, 720, 60, 65),
    ];

    it('keeps a correctly sized, low-confidence card that sits next to strong ones', () => {
      const cards = positionedCards([...row, det('KS', 0.04, 180, 62, 66)]);
      expect(cards.map((card) => card.code)).toContain('KS');
    });

    it('drops weak boxes whose size does not match the cards', () => {
      const cards = positionedCards([...row, det('KC', 0.09, 80, 160, 26), det('9S', 0.02, 540, 80, 113)]);
      expect(cards.map((card) => card.code).sort()).toEqual(['7S', 'AD', 'JC', 'KC', 'KH']);
    });

    it('drops weak boxes that are far from every strong card', () => {
      const cards = positionedCards([...row, det('2D', 0.05, 5000, 60, 65)]);
      expect(cards.map((card) => card.code)).not.toContain('2D');
    });

    it('gives a second far-away reading of a code its next-best code', () => {
      const cards = positionedCards([
        ...row,
        det('KC', 0.3, 180, 62, 66), det('KS', 0.1, 181, 62, 66),
      ]);
      const codes = cards.map((card) => card.code);
      expect(codes).toContain('KS');
      expect(codes.filter((code) => code === 'KC')).toHaveLength(1);
    });

    it('never returns the same card twice', () => {
      const cards = positionedCards([...row, det('KC', 0.3, 180, 62, 66), det('JC', 0.3, 280, 62, 66)]);
      const codes = cards.map((card) => card.code);
      expect(new Set(codes).size).toBe(codes.length);
    });
  });
});

describe('detectTable', () => {
  const codesOnTable = ['AS', 'KD', 'QH', 'JC', '10S', '2D', '3D'];
  const cardsInside = (region: Region, confidence = 0.8): Detection[] =>
    codesOnTable
      .map((code, i) => det(code, confidence, 100 + i * 150, 300))
      .filter((d) => d.box[0] >= region.x && d.box[2] <= region.x + region.width && d.box[1] >= region.y && d.box[3] <= region.y + region.height);

  it('confirms a clear photo with a second, zoomed round and then stops', async () => {
    const messages: string[] = [];
    const { run, calls } = makeRunner((region) => cardsInside(region));
    const { cards } = await detectTable(run, 1400, 800, (m) => messages.push(m));
    expect(cards).toHaveLength(7);
    expect(calls.length).toBeGreaterThan(5);
    expect(calls.length).toBeLessThan(30);
    expect(calls.every((c) => c.variant === 'plain')).toBe(true);
    expect(messages.some((m) => m.startsWith('Looking closer'))).toBe(true);
  });

  it('zooms in further when the cards it found are small', async () => {
    const small = (region: Region): Detection[] =>
      codesOnTable
        .map((code, i) => det(code, 0.8, 100 + i * 150, 300, 15))
        .filter((d) => d.box[0] >= region.x && d.box[2] <= region.x + region.width && d.box[1] >= region.y && d.box[3] <= region.y + region.height);
    const { run, calls } = makeRunner(small);
    await detectTable(run, 1400, 800);
    const smallest = Math.min(...calls.map((call) => call.region.width));
    expect(smallest).toBeLessThan(0.35 * 1400);
  });

  it('does not run the same zoom level twice', async () => {
    const { run, calls } = makeRunner((region) => cardsInside(region));
    await detectTable(run, 1400, 800);
    const keys = calls.map((call) => `${call.region.x},${call.region.y},${call.region.width},${call.variant}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('keeps looking, with more zoom levels, while cards are missing', async () => {
    const { run, calls } = makeRunner((region) => (region.width <= 700 ? cardsInside(region) : []));
    const { cards } = await detectTable(run, 1400, 800);
    expect(cards).toHaveLength(7);
    expect(calls.length).toBeGreaterThan(5);
  });

  it('retries with enhanced images when plain passes find too little', async () => {
    const messages: string[] = [];
    const { run, calls } = makeRunner((region, variant) => (variant === 'sharp3' ? cardsInside(region) : []));
    const { cards } = await detectTable(run, 1400, 800, (m) => messages.push(m));
    expect(cards).toHaveLength(7);
    expect(calls.some((c) => c.variant === 'sharp3')).toBe(true);
    expect(messages.some((m) => m.startsWith('Enhancing the photo'))).toBe(true);
  });

  it('keeps scanning when a card is only weakly read, then stops once the result is stable', async () => {
    const { run, calls } = makeRunner((region) => cardsInside(region, 0.2));
    const { cards } = await detectTable(run, 1400, 800);
    expect(cards).toHaveLength(7);
    expect(calls.length).toBeGreaterThan(5);
    expect(calls.length).toBeLessThan(40);
  });

  it('keeps scanning when the count cannot form a table, and still returns what it found', async () => {
    const { run, calls } = makeRunner(() => [det('AS', 0.9, 100, 100)]);
    const { cards } = await detectTable(run, 1400, 800);
    expect(cards.map((card) => card.code)).toEqual(['AS']);
    expect(calls.length).toBeGreaterThan(30);
  });
});

describe('gridRegions', () => {
  it('covers the image with half-overlapping windows inside its bounds', () => {
    const regions = gridRegions(1000, 800, 0.5);
    expect(regions).toHaveLength(9);
    expect(regions[0]).toEqual({ x: 0, y: 0, width: 500, height: 400 });
    expect(regions[8]).toEqual({ x: 500, y: 400, width: 500, height: 400 });
  });

  it('uses fewer windows at coarser zoom and keeps the aspect ratio', () => {
    const regions = gridRegions(1012, 224, 0.75);
    expect(regions).toHaveLength(4);
    expect(regions[0].width / regions[0].height).toBeCloseTo(1012 / 224, 1);
  });
});
