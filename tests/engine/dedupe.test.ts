import { describe, expect, it } from 'vitest';
import { groupTrades, removeFiller, topGroups } from '../../src/engine/dedupe';
import type { Trade } from '../../src/engine/types';

const t = (opponentId: string, give: string[], get: string[], score: number): Trade => ({
  opponentId, give, get, gainMe: score, gainThem: score, score,
});

describe('removeFiller', () => {
  it('drops a trade whose extra player barely changes the score', () => {
    const base = t('B', ['a'], ['x'], 10);
    const filler = t('B', ['a', 'b'], ['x'], 10.3);
    expect(removeFiller([base, filler], 0.05)).toEqual([base]);
  });

  it('keeps a bigger trade that is meaningfully better', () => {
    const base = t('B', ['a'], ['x'], 10);
    const better = t('B', ['a', 'b'], ['x'], 12);
    expect(removeFiller([base, better], 0.05)).toEqual([base, better]);
  });

  it('keeps a bigger trade when its smaller version did not qualify', () => {
    const bigger = t('B', ['a', 'b'], ['x'], 10);
    expect(removeFiller([bigger], 0.05)).toEqual([bigger]);
  });

  it('drops a bigger trade that scores below its smaller version', () => {
    const base = t('B', ['a'], ['x'], 10);
    const worse = t('B', ['a'], ['x', 'y'], 8);
    expect(removeFiller([base, worse], 0.05)).toEqual([base]);
  });

  it('judges each link of a chain against its own sub-trade', () => {
    const base = t('B', ['a'], ['x'], 10);
    const mid = t('B', ['a', 'b'], ['x'], 10.4);
    const top = t('B', ['a', 'b', 'c'], ['x'], 10.9);
    // mid is filler of base; top is filler of mid (10.9 ≤ 10.4 × 1.05) even though mid is dropped.
    expect(removeFiller([base, mid, top], 0.05)).toEqual([base]);
  });

  it('only compares trades with the same opponent', () => {
    const base = t('C', ['a'], ['x'], 10);
    const other = t('B', ['a', 'b'], ['x'], 10);
    expect(removeFiller([base, other], 0.05)).toHaveLength(2);
  });
});

describe('groupTrades / topGroups', () => {
  const values = { a: 100, b: 10, c: 50, x: 90, y: 5, z: 80 };

  it('groups by opponent and top player each way, best first', () => {
    const groups = groupTrades(
      [t('B', ['a'], ['x'], 5), t('B', ['a', 'b'], ['x', 'y'], 8), t('B', ['c'], ['z'], 6)],
      values,
    );
    expect(groups).toHaveLength(2);
    expect(groups[0].head.score).toBe(8);
    expect(groups[0].variants.map((v) => v.score)).toEqual([5]);
    expect(groups[1].head.score).toBe(6);
  });

  it('caps groups per opponent and overall', () => {
    const groups = [
      { head: t('B', ['1'], ['1'], 9), variants: [] },
      { head: t('B', ['2'], ['2'], 8), variants: [] },
      { head: t('C', ['3'], ['3'], 7), variants: [] },
      { head: t('B', ['4'], ['4'], 6), variants: [] },
    ];
    expect(topGroups(groups, 2, 10).map((g) => g.head.score)).toEqual([9, 8, 7]);
    expect(topGroups(groups, 2, 2).map((g) => g.head.score)).toEqual([9, 8]);
    expect(topGroups(groups, 2, 0)).toEqual([]);
    expect(topGroups([], 3, 25)).toEqual([]);
  });
});
