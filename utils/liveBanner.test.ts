import { describe, expect, it } from 'vitest';
import { LiveSnapshot } from '@/services/recognition/liveScanner';
import { LiveCard } from '@/services/recognition/live';
import { captureWarning, counterLabel, describeLive } from './liveBanner';

const card = (code: string, confidence: number, state: LiveCard['state']): LiveCard => ({
  code, confidence, state, frames: 3, box: [0, 0, 1, 1],
});
const snapshot = (over: Partial<LiveSnapshot> = {}): LiveSnapshot => ({
  cards: [], status: { detected: 0, expected: 5, unreadable: 0, extra: 0, complete: false }, recognised: 0, table: null,
  stable: false, scans: 3, frame: { width: 640, height: 480 }, emptyForMs: 0, ...over,
});
const cards5 = { kind: 'cards', expected: 5 } as const;
const base = { supported: true, loading: null, error: null, mode: cards5 };

describe('counterLabel', () => {
  it('shows detected over expected, capped at expected', () => {
    expect(counterLabel(null, cards5)).toBe('0/5 cards');
    expect(counterLabel(snapshot({ status: { detected: 3, expected: 5, unreadable: 0, extra: 0, complete: false } }), cards5)).toBe('3/5 cards');
    expect(counterLabel(snapshot({ status: { detected: 7, expected: 5, unreadable: 0, extra: 2, complete: false } }), cards5)).toBe('5/5 cards');
  });

  it('describes a table', () => {
    const table = { kind: 'table' } as const;
    expect(counterLabel(snapshot({ status: null, recognised: 7, table: { players: 1 } }), table)).toBe('7 cards · 1 player');
    expect(counterLabel(snapshot({ status: null, recognised: 4 }), table)).toBe('4 cards');
  });
});

describe('describeLive', () => {
  it('explains unsupported platforms, loading and errors', () => {
    expect(describeLive({ ...base, supported: false, snapshot: null })?.text).toContain('web app');
    expect(describeLive({ ...base, snapshot: null, loading: 'Loading card detector… 40%' })?.text).toContain('40%');
    expect(describeLive({ ...base, snapshot: null, error: 'x' })?.tone).toBe('bad');
  });

  it('celebrates a stable complete result', () => {
    const banner = describeLive({ ...base, snapshot: snapshot({ stable: true, status: { detected: 5, expected: 5, unreadable: 0, extra: 0, complete: true } }) });
    expect(banner).toMatchObject({ tone: 'good' });
    expect(banner?.text).toContain('All 5 cards detected');
  });

  it('reports unreadable cards, empty views, extras and progress', () => {
    const unreadable = describeLive({ ...base, snapshot: snapshot({ cards: [card('2C', 0.25, 'failed')], status: { detected: 0, expected: 5, unreadable: 1, extra: 0, complete: false } }) });
    expect(unreadable).toMatchObject({ tone: 'bad' });
    expect(describeLive({ ...base, snapshot: snapshot({ emptyForMs: 4000 }) })).toMatchObject({ tone: 'bad' });
    expect(describeLive({ ...base, snapshot: snapshot({ cards: [card('AS', 0.9, 'confident')], status: { detected: 6, expected: 5, unreadable: 0, extra: 1, complete: false } }) })?.text).toContain('6 cards visible but 5 needed');
    expect(describeLive({ ...base, snapshot: snapshot({ cards: [card('AS', 0.9, 'confident')], status: { detected: 1, expected: 5, unreadable: 0, extra: 0, complete: false } }) })?.text).toContain('1/5');
  });
});

describe('captureWarning', () => {
  it('only warns when live scanning is running and incomplete', () => {
    expect(captureWarning(null, cards5)).toBeNull();
    expect(captureWarning(snapshot({ stable: true }), cards5)).toBeNull();
    expect(captureWarning(snapshot({ status: { detected: 3, expected: 5, unreadable: 0, extra: 0, complete: false } }), cards5)).toContain('3/5');
    expect(captureWarning(snapshot({ status: null, recognised: 4 }), { kind: 'table' })).toContain('4 cards');
  });
});
