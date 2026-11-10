import { unsharpMask } from './imageOps';
import { CardIndex, pairIndexes, scanGlyphs } from './splitIndex';
import { Detection, INPUT_SIZE, decodeOutput, letterboxFor, rgbaToTensor } from './yolo';

export type TensorRunner = (input: Float32Array) => Promise<{ data: Float32Array; dims: readonly number[] }>;

/** Larger pictures are analysed at this size; glyphs stay large enough to read. */
const WORKING_SIZE = 1280;
/** Live frames are analysed smaller so the main thread is held up for less time. */
const LIVE_WORKING_SIZE = 800;
const COLUMNS = 6;
const ROWS = 4;
const CELL_WIDTH = Math.floor(INPUT_SIZE / COLUMNS);
const CELL_HEIGHT = Math.floor(INPUT_SIZE / ROWS);
/**
 * Layout tuned against the detector: a rank about 32 px tall with the suit
 * tucked right under it reads far better than a looser or larger index.
 */
const RANK_HEIGHT = 32;
const SUIT_HEIGHT = 30;
const SUIT_GAP = 2;
/** Soft photos are read from the rebuilt canvas as is and with moderate sharpening. */
const ENHANCERS: ((rgba: Uint8ClampedArray) => Uint8ClampedArray)[] = [
  (rgba) => rgba,
  (rgba) => unsharpMask(rgba, INPUT_SIZE, 2, 3),
  (rgba) => unsharpMask(rgba, INPUT_SIZE, 3, 2.5),
];
/** Rebuilt corners are checked by the detector, so only readings it is somewhat sure of are kept. */
const MIN_CONFIDENCE = 0.15;
/** A real index sits on a card: most of the area around its glyphs is white. */
const MIN_CARD_WHITE = 0.45;
const REDS = new Set(['H', 'D']);

interface Placed {
  index: CardIndex;
  column: number;
  row: number;
}

function drawCorner(
  context: CanvasRenderingContext2D, source: CanvasImageSource, index: CardIndex, left: number, top: number, factor: number,
) {
  const cardWidth = 96;
  const cardHeight = 136;
  context.fillStyle = '#ffffff';
  context.fillRect(left, top, cardWidth, cardHeight);
  context.strokeStyle = '#969696';
  context.lineWidth = 1;
  context.strokeRect(left + 0.5, top + 0.5, cardWidth - 1, cardHeight - 1);

  const [rx1, ry1, rx2, ry2] = [
    Math.min(...index.rank.map((glyph) => glyph.x)) - 1,
    Math.min(...index.rank.map((glyph) => glyph.y)) - 1,
    Math.max(...index.rank.map((glyph) => glyph.x + glyph.width)) + 1,
    Math.max(...index.rank.map((glyph) => glyph.y + glyph.height)) + 1,
  ];
  const rankHeight = RANK_HEIGHT;
  const rankWidth = ((rx2 - rx1) * rankHeight) / (ry2 - ry1);
  // Glyphs are located on the reduced copy but cut from the full-resolution picture.
  context.drawImage(
    source, rx1 / factor, ry1 / factor, (rx2 - rx1) / factor, (ry2 - ry1) / factor, left + 10, top + 10, rankWidth, rankHeight,
  );

  const suit = index.suit;
  const suitHeight = SUIT_HEIGHT;
  const suitWidth = ((suit.width + 2) * suitHeight) / (suit.height + 2);
  context.drawImage(
    source, (suit.x - 1) / factor, (suit.y - 1) / factor, (suit.width + 2) / factor, (suit.height + 2) / factor,
    left + 10 + (rankWidth - suitWidth) / 2, top + 10 + RANK_HEIGHT + SUIT_GAP, suitWidth, suitHeight,
  );
}

/**
 * Reads cards whose rank and suit are printed apart. Rank and suit glyphs are
 * found and paired, each pair is redrawn as a conventional corner index on a
 * model-sized canvas, and the same detector reads the rebuilt corners. Returns
 * ordinary detections placed where the glyphs are, so they can be voted with
 * detections from the normal passes.
 */
export async function detectSplitIndexCards(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  run: TensorRunner,
  options: { live?: boolean } = {},
): Promise<Detection[]> {
  const factor = Math.min(1, (options.live ? LIVE_WORKING_SIZE : WORKING_SIZE) / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * factor));
  const height = Math.max(1, Math.round(sourceHeight * factor));
  const enhancers = options.live ? ENHANCERS.slice(0, 1) : ENHANCERS;

  const working = document.createElement('canvas');
  working.width = width;
  working.height = height;
  const workingContext = working.getContext('2d', { willReadFrequently: true });
  const stage = document.createElement('canvas');
  stage.width = INPUT_SIZE;
  stage.height = INPUT_SIZE;
  const stageContext = stage.getContext('2d', { willReadFrequently: true });
  if (!workingContext || !stageContext) return [];

  try {
    workingContext.drawImage(source, 0, 0, width, height);
    const pixels = workingContext.getImageData(0, 0, width, height);
    const scan = scanGlyphs(pixels.data, width, height);
    const indexes = pairIndexes(scan.glyphs).filter((index) => scan.brightShare(index.box) >= MIN_CARD_WHITE);
    if (!indexes.length) return [];

    const perCanvas = COLUMNS * ROWS;
    const best = new Map<CardIndex, Detection>();
    for (let start = 0; start < indexes.length; start += perCanvas) {
      const batch = indexes.slice(start, start + perCanvas);
      const placed: Placed[] = batch.map((index, i) => ({ index, column: i % COLUMNS, row: Math.floor(i / COLUMNS) }));
      stageContext.fillStyle = 'rgb(34,110,58)';
      stageContext.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE);
      for (const { index, column, row } of placed) {
        drawCorner(stageContext, source, index, column * CELL_WIDTH + 4, row * CELL_HEIGHT + 4, factor);
      }
      const composed = stageContext.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE).data;
      for (const enhance of enhancers) {
        const tensor = rgbaToTensor(enhance(composed));
        const output = await run(tensor);
        const detections = decodeOutput(
          output.data, output.dims[2], letterboxFor(INPUT_SIZE, INPUT_SIZE),
          { x: 0, y: 0, width: INPUT_SIZE, height: INPUT_SIZE }, MIN_CONFIDENCE,
        );
        for (const { index, column, row } of placed) {
          const cell = { x1: column * CELL_WIDTH, y1: row * CELL_HEIGHT, x2: (column + 1) * CELL_WIDTH, y2: (row + 1) * CELL_HEIGHT };
          const inside = detections
            .filter((d) => {
              const cx = (d.box[0] + d.box[2]) / 2;
              const cy = (d.box[1] + d.box[3]) / 2;
              return cx >= cell.x1 && cx < cell.x2 && cy >= cell.y1 && cy < cell.y2 && REDS.has(d.code.slice(-1)) === index.red;
            })
            .sort((a, b) => b.confidence - a.confidence)[0];
          const known = best.get(index);
          if (inside && (!known || inside.confidence > known.confidence)) {
            const [x1, y1, x2, y2] = index.box;
            best.set(index, {
              code: inside.code,
              confidence: inside.confidence,
              box: [x1 / factor, y1 / factor, x2 / factor, y2 / factor],
              solid: true,
            });
          }
        }
      }
    }
    return [...best.values()];
  } finally {
    working.width = 0;
    stage.width = 0;
  }
}
