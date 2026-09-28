import { describe, expect, it } from 'vitest';
import { mulberry32, syntheticLeague } from '../../src/engine/synthetic';

describe('mulberry32', () => {
  it('is deterministic for a seed', () => {
    const a = mulberry32(1);
    const b = mulberry32(1);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe('syntheticLeague', () => {
  const { league, ranks } = syntheticLeague(42);

  it('builds 12 full 15-man rosters with no shared players', () => {
    expect(league.teams).toHaveLength(12);
    const all = league.teams.flatMap((t) => t.playerIds);
    expect(all).toHaveLength(180);
    expect(new Set(all).size).toBe(180);
  });

  it('fills every roster to 15 within positional caps, ranked by both creators', () => {
    const caps = { QB: 2, RB: 5, WR: 6, TE: 2 };
    for (const t of league.teams) {
      expect(t.playerIds).toHaveLength(15);
      for (const [pos, cap] of Object.entries(caps)) {
        const n = t.playerIds.filter((id) => league.players[id].position === pos).length;
        expect(n).toBeLessThanOrEqual(cap);
      }
      for (const id of t.playerIds) {
        expect(ranks[id].byCreator).toHaveProperty('Alpha');
        expect(ranks[id].byCreator).toHaveProperty('Beta');
      }
    }
  });

  it('throws instead of building short rosters past the caps', () => {
    expect(() => syntheticLeague(1, 10, 16)).toThrow(/Cannot fill a 16-man roster/);
  });

  it('is identical across calls with the same seed', () => {
    expect(syntheticLeague(42).league).toEqual(league);
  });
});
