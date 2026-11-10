/**
 * Cards whose rank and suit are printed apart (rank top-left, suit lower
 * right, as in many poker apps and illustrations) are not what the detector
 * was trained on, which expects both together in the corner index. This module
 * finds the separate rank and suit glyphs and pairs them so a corner index can
 * be rebuilt for the detector (see `splitIndexDetector.ts`). It is pure pixel
 * logic with no browser APIs.
 */

export interface Glyph {
  x: number;
  y: number;
  width: number;
  height: number;
  red: boolean;
}

export interface CardIndex {
  /** One glyph, or two for "10". Left to right. */
  rank: Glyph[];
  suit: Glyph;
  red: boolean;
  /** Union of rank and suit: x1, y1, x2, y2. */
  box: [number, number, number, number];
}

const MIN_GLYPH = 8;
const MAX_GLYPHS = 400;
const MIN_RING_BRIGHT = 0.5;
/** How far right of the rank (in rank heights) a suit must sit to count as a split index. */
const MIN_OFFSET = 0.35;

const percentile = (histogram: Uint32Array, total: number, fraction: number) => {
  let seen = 0;
  for (let value = 0; value < histogram.length; value += 1) {
    seen += histogram[value];
    if (seen >= total * fraction) return value;
  }
  return histogram.length - 1;
};

/**
 * Finds dark and red glyph-sized blobs that sit on a bright (card-white)
 * surface. Thresholds follow the picture's own white level so dim or washed
 * out photos still work.
 */
export interface GlyphScan {
  glyphs: Glyph[];
  /** Share of bright (card-white) pixels inside a box, to tell a card from chips or artwork. */
  brightShare(box: [number, number, number, number]): number;
}

export function findGlyphs(rgba: ArrayLike<number>, width: number, height: number): Glyph[] {
  return scanGlyphs(rgba, width, height).glyphs;
}

export function scanGlyphs(rgba: ArrayLike<number>, width: number, height: number): GlyphScan {
  const pixels = width * height;
  const lum = new Uint8Array(pixels);
  const histogram = new Uint32Array(256);
  for (let i = 0; i < pixels; i += 1) {
    const value = (rgba[i * 4] * 299 + rgba[i * 4 + 1] * 587 + rgba[i * 4 + 2] * 114) / 1000;
    lum[i] = value;
    histogram[lum[i]] += 1;
  }
  const white = percentile(histogram, pixels, 0.95);
  if (white < 110) return { glyphs: [], brightShare: () => 0 };

  const darkLimit = 0.45 * white;
  const redMin = 0.45 * white;
  const redMargin = 0.3 * white;
  const brightLimit = 0.7 * white;
  const grayLimit = 0.25 * white;

  // 1 = dark ink, 2 = red ink
  const ink = new Uint8Array(pixels);
  const bright = new Uint8Array(pixels);
  for (let i = 0; i < pixels; i += 1) {
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max < darkLimit) ink[i] = 1;
    else if (r > redMin && r - Math.max(g, b) > redMargin) ink[i] = 2;
    if (lum[i] > brightLimit && max - min < grayLimit) bright[i] = 1;
  }

  const parent = new Int32Array(pixels).fill(-1);
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    let node = index;
    while (parent[node] !== root) {
      const next = parent[node];
      parent[node] = root;
      node = next;
    }
    return root;
  };
  const join = (a: number, b: number) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[rootB] = rootA;
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const kind = ink[i];
      if (!kind) continue;
      parent[i] = i;
      if (x > 0 && ink[i - 1] === kind) join(i, i - 1);
      if (y > 0 && ink[i - width] === kind) join(i, i - width);
      if (y > 0 && x > 0 && ink[i - width - 1] === kind) join(i, i - width - 1);
      if (y > 0 && x < width - 1 && ink[i - width + 1] === kind) join(i, i - width + 1);
    }
  }

  const boxes = new Map<number, { x1: number; y1: number; x2: number; y2: number; area: number; kind: number }>();
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (!ink[i]) continue;
      const root = find(i);
      const box = boxes.get(root);
      if (box) {
        if (x < box.x1) box.x1 = x;
        if (x > box.x2) box.x2 = x;
        if (y < box.y1) box.y1 = y;
        if (y > box.y2) box.y2 = y;
        box.area += 1;
      } else {
        boxes.set(root, { x1: x, y1: y, x2: x, y2: y, area: 1, kind: ink[i] });
      }
    }
  }

  const maxSize = 0.25 * Math.min(width, height);
  const brightAround = (x: number, y: number, w: number, h: number) => {
    const pad = Math.max(2, Math.round(0.2 * h));
    let total = 0;
    let lit = 0;
    for (let yy = Math.max(0, y - pad); yy < Math.min(height, y + h + pad); yy += 2) {
      for (let xx = Math.max(0, x - pad); xx < Math.min(width, x + w + pad); xx += 2) {
        if (xx >= x && xx < x + w && yy >= y && yy < y + h) continue;
        total += 1;
        lit += bright[yy * width + xx];
      }
    }
    return total ? lit / total : 0;
  };

  const glyphs: Glyph[] = [];
  for (const box of boxes.values()) {
    const w = box.x2 - box.x1 + 1;
    const h = box.y2 - box.y1 + 1;
    if (h < MIN_GLYPH || h > maxSize || w < 3 || w > maxSize || w > 1.6 * h) continue;
    if (box.area / (w * h) < 0.15) continue;
    if (brightAround(box.x1, box.y1, w, h) < MIN_RING_BRIGHT) continue;
    glyphs.push({ x: box.x1, y: box.y1, width: w, height: h, red: box.kind === 2 });
  }
  const brightShare = ([x1, y1, x2, y2]: [number, number, number, number]) => {
    let total = 0;
    let lit = 0;
    for (let y = Math.max(0, Math.floor(y1)); y < Math.min(height, Math.ceil(y2)); y += 1) {
      for (let x = Math.max(0, Math.floor(x1)); x < Math.min(width, Math.ceil(x2)); x += 1) {
        total += 1;
        lit += bright[y * width + x];
      }
    }
    return total ? lit / total : 0;
  };
  return { glyphs: glyphs.length > MAX_GLYPHS ? [] : glyphs, brightShare };
}

const right = (glyph: Glyph) => glyph.x + glyph.width;
const bottom = (glyph: Glyph) => glyph.y + glyph.height;
const centreX = (glyph: Glyph) => glyph.x + glyph.width / 2;
const centreY = (glyph: Glyph) => glyph.y + glyph.height / 2;

/** "1" and "0" of a 10 are separate blobs; join neighbours of the same colour and size. */
function rankGroups(glyphs: Glyph[]): Glyph[][] {
  const used = new Set<Glyph>();
  const groups: Glyph[][] = [];
  const ordered = [...glyphs].sort((a, b) => a.x - b.x);
  for (const first of ordered) {
    if (used.has(first)) continue;
    used.add(first);
    const group = [first];
    const next = ordered.find((other) => {
      if (used.has(other) || other.red !== first.red) return false;
      const ratio = other.height / first.height;
      const gap = other.x - right(first);
      return ratio > 0.75 && ratio < 1.33 && Math.abs(other.y - first.y) <= 0.2 * first.height
        && gap >= -0.1 * first.height && gap <= 0.6 * first.height;
    });
    if (next) {
      used.add(next);
      group.push(next);
    }
    groups.push(group);
  }
  return groups;
}

const unionBox = (glyphs: Glyph[]): [number, number, number, number] => [
  Math.min(...glyphs.map((glyph) => glyph.x)),
  Math.min(...glyphs.map((glyph) => glyph.y)),
  Math.max(...glyphs.map(right)),
  Math.max(...glyphs.map(bottom)),
];

/**
 * Pairs each rank with the suit printed below and to the right of it (or
 * directly beneath, as on conventional cards), one-to-one, nearest first.
 */
export function pairIndexes(glyphs: Glyph[]): CardIndex[] {
  const groups = rankGroups(glyphs);
  const candidates: { group: Glyph[]; suit: Glyph; cost: number }[] = [];
  for (const group of groups) {
    const [x1, y1, x2, y2] = unionBox(group);
    const h = Math.max(...group.map((glyph) => glyph.height));
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    for (const suit of glyphs) {
      if (group.includes(suit) || suit.red !== group[0].red) continue;
      const ratio = suit.height / h;
      if (ratio < 0.5 || ratio > 1.3) continue;
      const dx = (centreX(suit) - cx) / h;
      const dy = (centreY(suit) - cy) / h;
      // Conventional cards stack the suit straight under the rank; the standard detector reads those.
      if (dy < 0.7 || dy > 2.4 || dx < MIN_OFFSET || dx > 2.0) continue;
      candidates.push({ group, suit, cost: Math.hypot(dx - 0.7, dy - 1.3) });
    }
  }
  candidates.sort((a, b) => a.cost - b.cost);

  const takenRanks = new Set<Glyph[]>();
  const takenSuits = new Set<Glyph>();
  const indexes: CardIndex[] = [];
  for (const { group, suit } of candidates) {
    if (takenRanks.has(group) || takenSuits.has(suit)) continue;
    takenRanks.add(group);
    takenSuits.add(suit);
    indexes.push({ rank: group, suit, red: suit.red, box: unionBox([...group, suit]) });
  }
  return indexes;
}
