import { describe, expect, it, vi } from 'vitest';
import {
  LIVE_CONFIDENT, LiveCard, LiveTracker, liveCodes, liveStateFor, liveStatus,
} from './live';
import { LiveEngine, LiveMode, LiveRenderer, LiveScanner, LiveSnapshot, planRegion, planVariant, trackedArea, zoomWindows } from './liveScanner';
import { coverTransform, mapBox } from './liveGeometry';
import { Detection, INPUT_SIZE } from './yolo';

const det = (code: string, confidence: number, x = 0, y = 0): Detection => ({
  code, confidence, box: [x, y, x + 30, y + 45],
});

describe('liveStateFor', () => {
  it('maps confidence to green, yellow and red', () => {
    expect(liveStateFor(0.9)).toBe('confident');
    expect(liveStateFor(LIVE_CONFIDENT)).toBe('confident');
    expect(liveStateFor(0.45)).toBe('uncertain');
    expect(liveStateFor(0.25)).toBe('failed');
  });
});

describe('LiveTracker', () => {
  it('updates a card as it moves and as confidence changes', () => {
    const tracker = new LiveTracker();
    tracker.update([det('AS', 0.9, 100, 100)], 0);
    tracker.update([det('AS', 0.9, 200, 100)], 100);
    const [card] = tracker.cards();
    expect(card.code).toBe('AS');
    expect(card.box[0]).toBeGreaterThan(100);
    expect(card.box[0]).toBeLessThan(200);
    expect(card.frames).toBe(2);
    for (let t = 200; t < 1000; t += 100) tracker.update([det('AS', 0.4, 200, 100)], t);
    expect(tracker.cards()[0].state).toBe('uncertain');
  });

  it('hides one-frame noise but shows a clearly read card at once', () => {
    const tracker = new LiveTracker();
    tracker.update([det('2C', 0.25, 0, 0), det('KD', 0.8, 300, 0)], 0);
    expect(tracker.cards().map((c) => c.code)).toEqual(['KD']);
    tracker.update([det('2C', 0.25, 0, 0)], 100);
    expect(tracker.cards().map((c) => c.code).sort()).toEqual(['2C', 'KD']);
    expect(tracker.cards().find((c) => c.code === '2C')?.state).toBe('failed');
  });

  it('keeps a card across a missed scan, fading it, then drops it', () => {
    const tracker = new LiveTracker({ maxMisses: 3 });
    tracker.update([det('AS', 0.9)], 0);
    tracker.update([], 100);
    const faded = tracker.cards()[0];
    expect(faded.confidence).toBeLessThan(0.9);
    tracker.update([], 200);
    tracker.update([], 300);
    expect(tracker.cards()).toEqual([]);
  });

  it('only counts a zoomed scan as a miss for cards inside that window', () => {
    const tracker = new LiveTracker({ maxMisses: 2 });
    tracker.update([det('AS', 0.9, 50, 50), det('KD', 0.9, 900, 500)], 0);
    const window = { x: 0, y: 0, width: 400, height: 300 };
    for (let i = 1; i <= 5; i += 1) tracker.update([det('AS', 0.9, 50, 50)], i * 100, window);
    expect(tracker.cards().map((c) => c.code).sort()).toEqual(['AS', 'KD']);
    for (let i = 6; i <= 8; i += 1) tracker.update([], i * 100, { x: 700, y: 400, width: 400, height: 300 });
    expect(tracker.cards().map((c) => c.code)).toEqual(['AS']);
  });

  it('drops cards not seen for too long even when no scan covered them', () => {
    const tracker = new LiveTracker({ maxAgeMs: 1000 });
    tracker.update([det('AS', 0.9, 50, 50)], 0);
    tracker.update([], 2000, { x: 900, y: 900, width: 100, height: 100 });
    expect(tracker.cards()).toEqual([]);
  });

  it('collapses two readings of one spot into the better one', () => {
    const tracker = new LiveTracker({ minFrames: 1 });
    tracker.update([det('6H', 0.7, 100, 100)], 0);
    tracker.update([det('6D', 0.45, 101, 100), det('6H', 0.7, 100, 100)], 100);
    // 6D is its own track but overlaps 6H almost exactly.
    expect(tracker.cards().map((c) => c.code)).toEqual(['6H']);
  });

  it('resets', () => {
    const tracker = new LiveTracker();
    tracker.update([det('AS', 0.9)], 0);
    tracker.reset();
    expect(tracker.cards()).toEqual([]);
  });
});

describe('liveStatus', () => {
  const card = (code: string, confidence: number): LiveCard => ({
    code, confidence, box: [0, 0, 1, 1], state: liveStateFor(confidence), frames: 3,
  });

  it('counts usable cards towards the expected total', () => {
    const status = liveStatus([card('AS', 0.9), card('KD', 0.5), card('2C', 0.25)], 5);
    expect(status).toMatchObject({ detected: 2, expected: 5, unreadable: 1, extra: 0, complete: false });
  });

  it('is complete only when exactly the expected cards are recognised', () => {
    const five = ['AS', 'KD', 'QH', 'JC', '10S'].map((c) => card(c, 0.8));
    expect(liveStatus(five, 5).complete).toBe(true);
    expect(liveStatus([...five, card('2D', 0.8)], 5)).toMatchObject({ complete: false, extra: 1 });
    expect(liveCodes([card('AS', 0.9), card('2C', 0.25)])).toEqual(['AS']);
  });
});

describe('planRegion', () => {
  it('scans the whole frame in cards mode, with a zoomed window now and then while cards are missing', () => {
    const mode: LiveMode = { kind: 'cards', expected: 5 };
    const regions = [0, 1, 2, 3, 4, 5].map((scan) => planRegion(mode, scan, 1000, 800, false));
    expect(regions[0]).toEqual({ x: 0, y: 0, width: 1000, height: 800 });
    expect(regions[2].width).toBeLessThan(1000);
    expect(regions[5].width).toBeLessThan(1000);
    expect(regions[2]).not.toEqual(regions[5]);
    expect(planRegion(mode, 2, 1000, 800, true).width).toBe(1000);
  });

  it('cycles through the whole frame and a grid of windows in table mode', () => {
    const mode: LiveMode = { kind: 'table' };
    const regions = Array.from({ length: 10 }, (_, scan) => planRegion(mode, scan, 1000, 800, false));
    expect(regions[0].width).toBe(1000);
    expect(new Set(regions.map((r) => `${r.x},${r.y},${r.width}`)).size).toBe(10);
    expect(planRegion(mode, 10, 1000, 800, false)).toEqual(regions[0]);
  });
});

describe('zoomed table scanning', () => {
  const card = (code: string, confidence: number): LiveCard => ({
    code, confidence, box: [0, 0, 1, 1], state: liveStateFor(confidence), frames: 3,
  });
  const strip = { cardSize: 30, box: [60, 230, 940, 370] as [number, number, number, number] };

  it('measures the tracked cards, ignoring failed ones', () => {
    const cards = [
      { ...card('AS', 0.8), box: [10, 20, 30, 50] as [number, number, number, number] },
      { ...card('KD', 0.7), box: [100, 40, 120, 70] as [number, number, number, number] },
      { ...card('2C', 0.2), state: 'failed' as const, box: [900, 900, 910, 910] as [number, number, number, number] },
    ];
    expect(trackedArea(cards)).toEqual({ cardSize: 30, box: [10, 20, 120, 70] });
    expect(trackedArea([])).toBeNull();
  });

  it('zooms until the cards reach the preferred size and tiles only the card area', () => {
    const windows = zoomWindows(1280, 720, strip);
    expect(windows.length).toBeGreaterThan(1);
    expect(windows.length).toBeLessThanOrEqual(6);
    for (const w of windows) {
      expect(w.width).toBeLessThan(1280 * 0.5);
      expect(w.x).toBeGreaterThanOrEqual(0);
      expect(w.x + w.width).toBeLessThanOrEqual(1280);
      expect(w.y + w.height).toBeLessThanOrEqual(720);
    }
    const covered = (x: number) => windows.some((w) => x >= w.x && x <= w.x + w.width);
    for (const x of [60, 300, 600, 940]) expect(covered(x)).toBe(true);
  });

  it('keeps the whole frame in the rotation', () => {
    const mode: LiveMode = { kind: 'table' };
    const regions = Array.from({ length: 12 }, (_, scan) => planRegion(mode, scan, 1280, 720, false, strip));
    expect(regions.some((r) => r.width === 1280)).toBe(true);
    expect(regions.some((r) => r.width < 1280)).toBe(true);
  });
});

describe('planVariant', () => {
  it('uses plain frames once complete and alternates with a mild enhancement while something is missing', () => {
    expect(planVariant({ kind: 'table' }, 1, true)).toBe('plain');
    expect([0, 1, 2, 3].map((scan) => planVariant({ kind: 'table' }, scan, false))).toEqual(['plain', 'sharp1', 'plain', 'sharp1']);
    expect(planVariant({ kind: 'cards', expected: 5 }, 1, false)).toBe('sharp1');
  });
});

describe('geometry', () => {
  it('maps source pixels to a cover-fitted view', () => {
    const t = coverTransform(640, 480, 400, 800);
    expect(t.scale).toBeCloseTo(800 / 480);
    expect(t.offsetY).toBeCloseTo(0);
    expect(t.offsetX).toBeCloseTo((400 - 640 * (800 / 480)) / 2);
    const box = mapBox([320, 240, 360, 300], t);
    expect(box.x + box.width / 2).toBeCloseTo(t.offsetX + 340 * t.scale);
  });
});

describe('LiveScanner', () => {
  function outputWith(entries: { code: number; conf: number; cx: number; cy: number; w: number; h: number }[]) {
    const anchors = 8400;
    const data = new Float32Array(56 * anchors);
    entries.forEach((entry, i) => {
      data[0 * anchors + i] = entry.cx;
      data[1 * anchors + i] = entry.cy;
      data[2 * anchors + i] = entry.w;
      data[3 * anchors + i] = entry.h;
      data[(4 + entry.code) * anchors + i] = entry.conf;
    });
    return { data, dims: [1, 56, anchors] as const };
  }

  const frame = { width: 640, height: 640 };
  const source = (counter = { n: 0 }) => ({
    size: () => frame,
    image: () => ({}) as CanvasImageSource,
    frameId: () => counter.n++,
  });
  const renderer = (): LiveRenderer & { disposed: number; renders: number } => {
    const r = {
      disposed: 0, renders: 0,
      render: () => { r.renders += 1; return new Uint8ClampedArray(INPUT_SIZE * INPUT_SIZE * 4); },
      dispose: () => { r.disposed += 1; },
    };
    return r;
  };

  it('scans repeatedly, reports updates, and releases resources on stop', async () => {
    vi.useFakeTimers();
    const updates: LiveSnapshot[] = [];
    // class 39 is "AS" in the bundled model.
    const engine: LiveEngine = { run: async () => outputWith([{ code: 39, conf: 0.9, cx: 320, cy: 320, w: 60, h: 90 }]) };
    const r = renderer();
    const scanner = new LiveScanner({
      engine, renderer: r, source: source(), mode: { kind: 'cards', expected: 2 },
      onUpdate: (s) => updates.push(s),
    });
    scanner.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(updates.length).toBeGreaterThan(3);
    const last = updates[updates.length - 1];
    expect(last.cards.map((c) => c.code)).toEqual(['AS']);
    expect(last.cards[0].state).toBe('confident');
    expect(last.status).toMatchObject({ detected: 1, expected: 2, complete: false });
    expect(last.stable).toBe(false);

    scanner.stop();
    const count = updates.length;
    await vi.advanceTimersByTimeAsync(2000);
    expect(updates.length).toBe(count);
    expect(r.disposed).toBe(1);
    expect(scanner.isRunning).toBe(false);
    vi.useRealTimers();
  });

  it('never runs two scans at once', async () => {
    vi.useFakeTimers();
    let active = 0;
    let peak = 0;
    const engine: LiveEngine = {
      run: async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 500));
        active -= 1;
        return outputWith([]);
      },
    };
    const scanner = new LiveScanner({
      engine, renderer: renderer(), source: source(), mode: { kind: 'cards', expected: 5 }, onUpdate: () => undefined,
    });
    scanner.start();
    await vi.advanceTimersByTimeAsync(5000);
    scanner.stop();
    expect(peak).toBe(1);
    vi.useRealTimers();
  });

  it('skips frames that have not changed', async () => {
    vi.useFakeTimers();
    const r = renderer();
    const scanner = new LiveScanner({
      engine: { run: async () => outputWith([]) },
      renderer: r,
      source: { size: () => frame, image: () => ({}) as CanvasImageSource, frameId: () => 7 },
      mode: { kind: 'cards', expected: 5 },
      onUpdate: () => undefined,
    });
    scanner.start();
    await vi.advanceTimersByTimeAsync(2000);
    scanner.stop();
    expect(r.renders).toBe(1);
    vi.useRealTimers();
  });

  it('reports a stable, complete result only after consecutive agreeing scans', async () => {
    vi.useFakeTimers();
    const updates: LiveSnapshot[] = [];
    const engine: LiveEngine = {
      run: async () => outputWith([
        { code: 39, conf: 0.9, cx: 200, cy: 320, w: 60, h: 90 },
        { code: 46, conf: 0.8, cx: 400, cy: 320, w: 60, h: 90 },
      ]),
    };
    const scanner = new LiveScanner({
      engine, renderer: renderer(), source: source(), mode: { kind: 'cards', expected: 2 },
      onUpdate: (s) => updates.push(s),
    });
    scanner.start();
    await vi.advanceTimersByTimeAsync(1000);
    scanner.stop();
    expect(updates[0].status?.complete).toBe(true);
    expect(updates[0].stable).toBe(false);
    expect(updates[updates.length - 1].stable).toBe(true);
    vi.useRealTimers();
  });

  it('reports engine failures without stopping', async () => {
    vi.useFakeTimers();
    const errors: string[] = [];
    let calls = 0;
    const scanner = new LiveScanner({
      engine: { run: async () => { calls += 1; throw new Error('boom'); } },
      renderer: renderer(), source: source(), mode: { kind: 'cards', expected: 5 },
      onUpdate: () => undefined, onError: (e) => errors.push(e.message),
    });
    scanner.start();
    await vi.advanceTimersByTimeAsync(1000);
    scanner.stop();
    expect(errors[0]).toBe('boom');
    expect(calls).toBeGreaterThan(1);
    vi.useRealTimers();
  });

  it('waits for the camera to have a frame', async () => {
    vi.useFakeTimers();
    let ready = false;
    const updates: LiveSnapshot[] = [];
    const scanner = new LiveScanner({
      engine: { run: async () => outputWith([]) }, renderer: renderer(),
      source: { size: () => (ready ? frame : null), image: () => (ready ? ({}) as CanvasImageSource : null) },
      mode: { kind: 'cards', expected: 5 }, onUpdate: (s) => updates.push(s),
    });
    scanner.start();
    await vi.advanceTimersByTimeAsync(500);
    expect(updates).toHaveLength(0);
    ready = true;
    await vi.advanceTimersByTimeAsync(500);
    expect(updates.length).toBeGreaterThan(0);
    scanner.stop();
    vi.useRealTimers();
  });
});
