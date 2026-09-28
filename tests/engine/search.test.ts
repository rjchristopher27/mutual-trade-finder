import { describe, expect, it } from 'vitest';
import { makeLineupContext, scoreTeam, sortByValue } from '../../src/engine/lineup';
import { combinations, findTrades, nashScore, rescore } from '../../src/engine/search';
import { STANDARD_SLOTS, syntheticLeague } from '../../src/engine/synthetic';
import { applyTrade } from '../../src/engine/trade';
import { DEFAULT_SETTINGS, type Slot } from '../../src/engine/types';
import { buildValues } from '../../src/engine/values';
import { leagueOf } from '../helpers/build';

const SIMPLE: Slot[] = [
  { name: 'RB', eligible: ['RB'] },
  { name: 'RB', eligible: ['RB'] },
  { name: 'WR', eligible: ['WR'] },
  { name: 'WR', eligible: ['WR'] },
];

describe('combinations', () => {
  it('lists every non-empty combination up to the size cap', () => {
    expect(combinations(['a', 'b', 'c'], 2)).toEqual([
      ['a'], ['a', 'b'], ['a', 'c'], ['b'], ['b', 'c'], ['c'],
    ]);
  });
});

describe('nashScore', () => {
  it('prefers balanced gains at alpha 0.5', () => {
    expect(nashScore(10, 10, 0.5)).toBeGreaterThan(nashScore(19, 1, 0.5));
  });
});

describe('findTrades', () => {
  // A is WR-rich / RB-poor; B is the mirror. Swapping A's WR3 for B's RB3 helps both.
  const { league, values } = leagueOf(SIMPLE, {
    A: [['aw1', 'WR', 100], ['aw2', 'WR', 90], ['aw3', 'WR', 80], ['ar1', 'RB', 60], ['ar2', 'RB', 10]],
    B: [['br1', 'RB', 100], ['br2', 'RB', 90], ['br3', 'RB', 80], ['bw1', 'WR', 60], ['bw2', 'WR', 10]],
  });
  const settings = { ...DEFAULT_SETTINGS, depthWeights: [0.25, 0.1] };

  it('finds a 1-for-1 WR-for-RB swap that helps both teams equally', () => {
    const [best] = findTrades({ league, values, myTeamId: 'A', settings });
    expect(best.give).toHaveLength(1);
    expect(best.get).toHaveLength(1);
    expect(league.players[best.give[0]].position).toBe('WR');
    expect(league.players[best.get[0]].position).toBe('RB');
    // e.g. aw3→br3: A goes 280 → 332.5 (RB room 70 → 142.5, WR room 210 → 190).
    expect(best.gainMe).toBeCloseTo(52.5);
    expect(best.gainThem).toBeCloseTo(52.5);
  });

  it('honors untouchable and must-include', () => {
    const none = findTrades({ league, values, myTeamId: 'A', settings: { ...settings, untouchable: ['aw3'] } });
    expect(none.every((t) => !t.give.includes('aw3'))).toBe(true);
    const must = findTrades({ league, values, myTeamId: 'A', settings: { ...settings, mustInclude: 'aw2' } });
    expect(must.length).toBeGreaterThan(0);
    expect(must.every((t) => t.give.includes('aw2'))).toBe(true);
  });

  it('keeps only trades that raise the target room when one is set', () => {
    const ctx = makeLineupContext(SIMPLE, settings.depthWeights);
    const a = league.teams.find((t) => t.id === 'A')!;
    const before = scoreTeam(a.playerIds, league.players, values, ctx).rooms.RB;
    const rb = findTrades({ league, values, myTeamId: 'A', settings: { ...settings, targetPosition: 'RB' } });
    expect(rb.length).toBeGreaterThan(0);
    for (const t of rb) {
      const { roster } = applyTrade(sortByValue(a.playerIds, values), t.give, t.get, a.openSpots, values, league.players, ctx);
      expect(scoreTeam(roster, league.players, values, ctx).rooms.RB).toBeGreaterThan(before);
    }
  });

  it('throws when must-include is also untouchable', () => {
    expect(() =>
      findTrades({ league, values, myTeamId: 'A', settings: { ...settings, mustInclude: 'aw2', untouchable: ['aw2'] } }),
    ).toThrow(/also untouchable/);
  });

  it('throws when a roster lists a player with no player data', () => {
    const broken = { ...league, teams: league.teams.map((t) => (t.id === 'B' ? { ...t, playerIds: [...t.playerIds, 'ghost'] } : t)) };
    expect(() => findTrades({ league: broken, values, myTeamId: 'A', settings })).toThrow(/Team B lists ghost/);
  });

  it('throws when must-include is not on my roster', () => {
    expect(() =>
      findTrades({ league, values, myTeamId: 'A', settings: { ...settings, mustInclude: 'br1' } }),
    ).toThrow(/not on team A/);
  });

  it('respects a target position', () => {
    const wr = findTrades({ league, values, myTeamId: 'A', settings: { ...settings, targetPosition: 'WR' } });
    expect(wr).toEqual([]);
  });

  it('returns nothing when neither team has surplus', () => {
    const flat = leagueOf(SIMPLE, {
      A: [['a1', 'RB', 50], ['a2', 'RB', 50], ['a3', 'WR', 50], ['a4', 'WR', 50]],
      B: [['b1', 'RB', 50], ['b2', 'RB', 50], ['b3', 'WR', 50], ['b4', 'WR', 50]],
    });
    expect(findTrades({ ...flat, myTeamId: 'A', settings })).toEqual([]);
  });
});

describe('findTrades property: every trade helps both teams', () => {
  it('holds when each trade is re-scored independently, including roster drops', () => {
    let tradesWithDrops = 0;
    for (const seed of [1, 2, 3]) {
      const base = syntheticLeague(seed, 4, 12);
      // Vary open spots (0-2) so uneven trades force drops on one side or the other.
      const league = { ...base.league, teams: base.league.teams.map((t, i) => ({ ...t, openSpots: (seed + i) % 3 })) };
      const ranks = base.ranks;
      const settings = { ...DEFAULT_SETTINGS, maxPerSide: 3 };
      const ids = league.teams.flatMap((t) => t.playerIds);
      const { values } = buildValues(ids, ranks, settings);
      const ctx = makeLineupContext(STANDARD_SLOTS, settings.depthWeights);
      const trades = findTrades({ league, values, myTeamId: 't1', settings });
      expect(trades.length).toBeGreaterThan(0);
      for (const t of trades) {
        for (const [team, out, inc] of [
          [league.teams.find((x) => x.id === 't1')!, t.give, t.get],
          [league.teams.find((x) => x.id === t.opponentId)!, t.get, t.give],
        ] as const) {
          const before = scoreTeam(team.playerIds, league.players, values, ctx).total;
          const { roster, dropped } = applyTrade(sortByValue(team.playerIds, values), out, inc, team.openSpots, values, league.players, ctx);
          if (dropped.length > 0) tradesWithDrops++;
          const after = scoreTeam(roster, league.players, values, ctx).total;
          expect(after - before).toBeGreaterThanOrEqual(settings.minGainPct * before);
          expect(after).toBeGreaterThan(before);
          const reported = team.id === 't1' ? t.gainMe : t.gainThem;
          expect(reported).toBeCloseTo(after - before, 9);
        }
      }
    }
    expect(tradesWithDrops).toBeGreaterThan(0);
  });
});

describe('rescore', () => {
  it('re-sorts by a new alpha without changing gains', () => {
    const trades = [
      { opponentId: 'B', give: ['x'], get: ['y'], gainMe: 20, gainThem: 1, score: 0 },
      { opponentId: 'B', give: ['z'], get: ['w'], gainMe: 5, gainThem: 5, score: 0 },
    ];
    expect(rescore(trades, 0.5)[0].give).toEqual(['z']);
    expect(rescore(trades, 0.95)[0].give).toEqual(['x']);
  });
});

describe('performance', () => {
  it('searches a 12-team, 15-man-roster league in under 5 seconds', () => {
    const { league, ranks } = syntheticLeague(42);
    const { values } = buildValues(league.teams.flatMap((t) => t.playerIds), ranks, DEFAULT_SETTINGS);
    const start = performance.now();
    findTrades({ league, values, myTeamId: 't1', settings: DEFAULT_SETTINGS });
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(5000);
  }, 30_000);

  it('stays under 5 seconds with overlapping W/R and W/T flex slots', () => {
    const slots: Slot[] = [
      ...STANDARD_SLOTS.slice(0, 6),
      { name: 'W/R', eligible: ['WR', 'RB'] },
      { name: 'W/T', eligible: ['WR', 'TE'] },
    ];
    const { league, ranks } = syntheticLeague(42, 12, 15, slots);
    const { values } = buildValues(league.teams.flatMap((t) => t.playerIds), ranks, DEFAULT_SETTINGS);
    const start = performance.now();
    findTrades({ league, values, myTeamId: 't1', settings: DEFAULT_SETTINGS });
    expect(performance.now() - start).toBeLessThan(5000);
  }, 30_000);
});
