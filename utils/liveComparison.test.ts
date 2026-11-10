import { describe, expect, it } from 'vitest';
import { compareRecognition } from './liveComparison';

describe('compareRecognition', () => {
  it('reports agreement', () => {
    const result = compareRecognition(['AS', 'KD'], ['KD', 'AS']);
    expect(result.identical).toBe(true);
    expect(result.summary).toContain('agree on all 2 cards');
  });

  it('reports differences in both directions', () => {
    const result = compareRecognition(['AS', 'KD', '2C'], ['AS', 'KD', 'QH']);
    expect(result.agreed).toEqual(['AS', 'KD']);
    expect(result.onlyLive).toEqual(['2C']);
    expect(result.onlyFinal).toEqual(['QH']);
    expect(result.identical).toBe(false);
    expect(result.summary).toContain('photo also read QH');
    expect(result.summary).toContain('live preview saw 2C');
  });

  it('handles a missing live result', () => {
    const result = compareRecognition([], ['AS']);
    expect(result.summary).toContain('No live preview');
    expect(result.onlyFinal).toEqual(['AS']);
  });
});
