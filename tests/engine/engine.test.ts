import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, reweight, runEngine } from '../../src/engine';
import { syntheticLeague } from '../../src/engine/synthetic';

describe('runEngine (end to end on a synthetic league)', () => {
  const { league, ranks } = syntheticLeague(42, 6, 14);
  const settings = { ...DEFAULT_SETTINGS, maxPerSide: 2 };
  const result = runEngine(league, ranks, 't1', settings);

  it('returns grouped trades with a report per group', () => {
    expect(result.groups.length).toBeGreaterThan(0);
    expect(result.reports).toHaveLength(result.groups.length);
    expect(result.groups.length).toBeLessThanOrEqual(settings.limit);
  });

  it('never shows more than the per-opponent cap', () => {
    const counts: Record<string, number> = {};
    for (const g of result.groups) counts[g.head.opponentId] = (counts[g.head.opponentId] ?? 0) + 1;
    expect(Math.max(...Object.values(counts))).toBeLessThanOrEqual(settings.perOpponentCap);
  });

  it('reports each group head with ranks consistent with the league baseline', () => {
    result.reports.forEach((r, i) => {
      expect(r.trade).toBe(result.groups[i].head);
      expect(r.me.overall[0]).toBe(result.baseRanks.overall.t1);
      expect(r.them.overall[0]).toBe(result.baseRanks.overall[r.trade.opponentId]);
      expect(Object.keys(r.me.rooms)).toEqual(['QB', 'RB', 'WR', 'TE']);
      // Both teams' scores rise and no other team changes, so neither can fall in the overall ranks.
      expect(r.me.overall[1]).toBeLessThanOrEqual(r.me.overall[0]);
      expect(r.them.overall[1]).toBeLessThanOrEqual(r.them.overall[0]);
    });
  });

  it('reweight gives the same result as a fresh run at the new alpha', () => {
    const favorMe = reweight(league, result, { alpha: 0.9, fillerTolerance: 0.05, perOpponentCap: 3, limit: 25 });
    const fresh = runEngine(league, ranks, 't1', { ...settings, alpha: 0.9 });
    expect(favorMe.groups).toEqual(fresh.groups);
    expect(favorMe.reports).toEqual(fresh.reports);
    expect(favorMe.settings.alpha).toBe(0.9);
    expect(result.settings.alpha).toBe(0.5);
  });

  it('reweight ignores non-view settings even when a whole settings object is passed', () => {
    // A UI would likely pass its whole settings state; only the view fields may take effect.
    const uiState = { ...settings, alpha: 0.9, k: 0.05, depthWeights: [0.9, 0.9] };
    const leaky = reweight(league, result, uiState);
    expect(leaky.settings.k).toBe(settings.k);
    expect(leaky.settings.depthWeights).toEqual(settings.depthWeights);
    expect(leaky.baseRanks).toEqual(result.baseRanks);
    expect(leaky.myTeamId).toBe('t1');
  });

  it('switches to a creator board', () => {
    const alpha = runEngine(league, ranks, 't1', { ...settings, creator: 'Alpha' });
    expect(alpha.values).not.toEqual(result.values);
  });
});
