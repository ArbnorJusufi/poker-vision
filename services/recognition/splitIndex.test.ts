import { describe, expect, it } from 'vitest';
import { outsideSeededSpots, positionedCards } from './pipeline';
import { Glyph, findGlyphs, pairIndexes, scanGlyphs } from './splitIndex';
import { Detection } from './yolo';

const WIDTH = 240;
const HEIGHT = 160;

type Colour = [number, number, number];
const FELT: Colour = [30, 110, 50];
const WHITE: Colour = [250, 250, 250];
const BLACK: Colour = [20, 20, 20];
const RED: Colour = [210, 30, 40];

function canvas() {
  const rgba = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  const fill = (x: number, y: number, w: number, h: number, [r, g, b]: Colour) => {
    for (let yy = y; yy < y + h; yy += 1) {
      for (let xx = x; xx < x + w; xx += 1) {
        const i = (yy * WIDTH + xx) * 4;
        rgba[i] = r;
        rgba[i + 1] = g;
        rgba[i + 2] = b;
        rgba[i + 3] = 255;
      }
    }
  };
  fill(0, 0, WIDTH, HEIGHT, FELT);
  return { rgba, fill };
}

/** A white card with a tall rank glyph top-left and a suit glyph lower right. */
function splitCard(fill: ReturnType<typeof canvas>['fill'], x: number, y: number, ink: Colour) {
  fill(x, y, 40, 60, WHITE);
  fill(x + 6, y + 6, 8, 20, ink);
  fill(x + 20, y + 30, 14, 16, ink);
}

describe('findGlyphs', () => {
  it('finds ink on a white card and ignores the felt and unlit blobs', () => {
    const { rgba, fill } = canvas();
    splitCard(fill, 20, 20, BLACK);
    fill(150, 100, 12, 16, BLACK);
    const glyphs = findGlyphs(rgba, WIDTH, HEIGHT);
    expect(glyphs).toHaveLength(2);
    expect(glyphs.every((glyph) => !glyph.red)).toBe(true);
    expect(glyphs.map((glyph) => glyph.height).sort()).toEqual([16, 20]);
  });

  it('tells red ink from dark ink', () => {
    const { rgba, fill } = canvas();
    splitCard(fill, 20, 20, RED);
    expect(findGlyphs(rgba, WIDTH, HEIGHT).every((glyph) => glyph.red)).toBe(true);
  });

  it('measures how much of an area is card white', () => {
    const { rgba, fill } = canvas();
    splitCard(fill, 20, 20, BLACK);
    const scan = scanGlyphs(rgba, WIDTH, HEIGHT);
    expect(scan.brightShare([20, 20, 60, 80])).toBeGreaterThan(0.7);
    expect(scan.brightShare([120, 90, 180, 150])).toBeLessThan(0.1);
  });

  it('returns nothing for a dark picture', () => {
    const rgba = new Uint8ClampedArray(WIDTH * HEIGHT * 4).fill(40);
    expect(findGlyphs(rgba, WIDTH, HEIGHT)).toEqual([]);
  });
});

describe('pairIndexes', () => {
  const glyph = (x: number, y: number, width: number, height: number, red = false): Glyph => ({ x, y, width, height, red });

  it('pairs each rank with the suit below and to the right of it', () => {
    const { rgba, fill } = canvas();
    splitCard(fill, 10, 20, BLACK);
    splitCard(fill, 80, 20, RED);
    const indexes = pairIndexes(findGlyphs(rgba, WIDTH, HEIGHT));
    expect(indexes).toHaveLength(2);
    expect(indexes.map((index) => index.red).sort()).toEqual([false, true]);
    for (const index of indexes) {
      expect(index.rank).toHaveLength(1);
      expect(index.suit.y).toBeGreaterThan(index.rank[0].y);
      expect(index.box[2] - index.box[0]).toBeGreaterThan(index.rank[0].width);
    }
  });

  it('joins the two glyphs of a 10 into one rank', () => {
    const indexes = pairIndexes([glyph(10, 10, 6, 20), glyph(19, 10, 10, 20), glyph(24, 36, 14, 16)]);
    expect(indexes).toHaveLength(1);
    expect(indexes[0].rank).toHaveLength(2);
  });

  it('never pairs a red rank with a black suit', () => {
    expect(pairIndexes([glyph(10, 10, 8, 20, true), glyph(22, 36, 14, 16, false)])).toEqual([]);
  });

  it('uses each suit once, for the nearest rank', () => {
    const indexes = pairIndexes([glyph(10, 10, 8, 20), glyph(60, 10, 8, 20), glyph(22, 36, 14, 16)]);
    expect(indexes).toHaveLength(1);
    expect(indexes[0].rank[0].x).toBe(10);
  });

  it('leaves conventional cards, with the suit straight under the rank, to the standard detector', () => {
    expect(pairIndexes([glyph(10, 10, 8, 20), glyph(10, 34, 8, 16)])).toEqual([]);
  });

  it('ignores a suit that is far too big or sits above the rank', () => {
    expect(pairIndexes([glyph(10, 40, 8, 20), glyph(22, 10, 14, 16)])).toEqual([]);
    expect(pairIndexes([glyph(10, 10, 8, 20), glyph(22, 36, 40, 60)])).toEqual([]);
  });
});

describe('seeded spots', () => {
  const read = (code: string, box: Detection['box'], extra: Partial<Detection> = {}): Detection => ({
    code, confidence: 0.8, box, ...extra,
  });

  it('drops standard guesses made where a split-index card was already read', () => {
    const seed = [read('AC', [100, 100, 128, 143], { solid: true })];
    const guesses = [read('4H', [104, 104, 128, 146]), read('KD', [400, 100, 430, 143])];
    expect(outsideSeededSpots(guesses, seed).map((d) => d.code)).toEqual(['KD']);
    expect(outsideSeededSpots(guesses, [])).toEqual(guesses);
  });

  it('lets only confident readings veto the standard detector', () => {
    const weakSeed = [read('KS', [100, 100, 128, 143], { solid: true, confidence: 0.2 })];
    const guesses = [read('4H', [104, 104, 128, 146])];
    expect(outsideSeededSpots(guesses, weakSeed)).toEqual(guesses);
  });

  it('keeps overlapped neighbours that are closer than a normal ghost corner', () => {
    const detections = [
      read('AH', [416, 264, 444, 307], { solid: true }),
      read('KS', [450, 264, 477, 308], { solid: true, confidence: 0.18 }),
      read('5D', [562, 180, 587, 223], { solid: true }),
      read('5H', [529, 180, 555, 223], { solid: true }),
      read('9S', [390, 188, 417, 231], { solid: true }),
      read('9H', [349, 188, 377, 231], { solid: true }),
      read('AC', [228, 188, 257, 233], { solid: true }),
    ];
    const codes = positionedCards(detections).map((card) => card.code);
    expect(codes).toContain('KS');
    expect(codes).toContain('AH');
  });
});
