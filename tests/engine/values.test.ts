import { describe, expect, it } from 'vitest';
import { buildValues, rankToValue } from '../../src/engine/values';

describe('rankToValue', () => {
  it('decays exponentially from 1000', () => {
    expect(rankToValue(0, 0.02)).toBe(1000);
    expect(rankToValue(1, 0.02)).toBeCloseTo(980.2, 1);
    expect(rankToValue(50, 0.02)).toBeCloseTo(367.9, 1);
  });

  it('makes one elite player worth more than two rank-40 players', () => {
    expect(rankToValue(1, 0.02)).toBeGreaterThan(2 * rankToValue(40, 0.02));
  });
});

describe('buildValues', () => {
  const ranks = {
    a: { consensus: 1, byCreator: { Alpha: 10 } },
    b: { consensus: 20, byCreator: {} },
  };

  it('uses consensus by default', () => {
    const { values, fallbacks } = buildValues(['a', 'b'], ranks, { k: 0.02, creator: null });
    expect(values.a).toBeCloseTo(rankToValue(1, 0.02));
    expect(values.b).toBeCloseTo(rankToValue(20, 0.02));
    expect(fallbacks.size).toBe(0);
  });

  it("uses the creator's rank and falls back to consensus when missing", () => {
    const { values, fallbacks } = buildValues(['a', 'b'], ranks, { k: 0.02, creator: 'Alpha' });
    expect(values.a).toBeCloseTo(rankToValue(10, 0.02));
    expect(values.b).toBeCloseTo(rankToValue(20, 0.02));
    expect([...fallbacks]).toEqual(['b']);
  });

  it('treats a creator rank of 0 as a real rank, not a missing one', () => {
    const r = { z: { consensus: 30, byCreator: { Alpha: 0 } } };
    const { values, fallbacks } = buildValues(['z'], r, { k: 0.02, creator: 'Alpha' });
    expect(values.z).toBe(1000);
    expect(fallbacks.size).toBe(0);
  });

  it('values unranked players at 0 and reports them', () => {
    const { values, unranked } = buildValues(['zz'], ranks, { k: 0.02, creator: null });
    expect(values.zz).toBe(0);
    expect([...unranked]).toEqual(['zz']);
  });
});
