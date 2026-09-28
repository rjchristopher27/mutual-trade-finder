import { describe, expect, it } from 'vitest';
import { FastScorer } from '../../src/engine/fast';
import { makeLineupContext, scoreSorted, sortByValue } from '../../src/engine/lineup';
import { mulberry32, STANDARD_SLOTS, syntheticLeague } from '../../src/engine/synthetic';
import { applyTrade } from '../../src/engine/trade';
import { DEFAULT_SETTINGS, POSITIONS, type Slot } from '../../src/engine/types';
import { buildValues } from '../../src/engine/values';
import { playersOf } from '../helpers/build';

const layouts: Slot[][] = [
  STANDARD_SLOTS,
  [...STANDARD_SLOTS, { name: 'SF', eligible: ['QB', 'RB', 'WR', 'TE'] }],
  [
    { name: 'A', eligible: ['RB', 'WR'] },
    { name: 'B', eligible: ['WR', 'TE'] },
    { name: 'QB', eligible: ['QB'] },
  ],
];

describe('FastScorer', () => {
  it('uses the same flex tie rule as the reference scorer', () => {
    const { players, values } = playersOf([
      ['qb1', 'QB', 100], ['rb1', 'RB', 90], ['rb2', 'RB', 80],
      ['wr1', 'WR', 85], ['wr2', 'WR', 60], ['wr3', 'WR', 50], ['wr4', 'WR', 40],
      ['te1', 'TE', 70], ['te2', 'TE', 50],
    ]);
    const ids = sortByValue(Object.keys(players), values);
    const ctx = makeLineupContext(STANDARD_SLOTS, DEFAULT_SETTINGS.depthWeights);
    const fast = new FastScorer(ids, players, values, ctx);
    const all = ids.map((_, i) => i);
    expect(fast.score(all, [], [], 0)).toBeCloseTo(scoreSorted(ids, players, values, ctx).total, 9);
    expect(fast.score(all, [], [], 0)).toBeCloseTo(557.5, 9);
    const ref = scoreSorted(ids, players, values, ctx);
    POSITIONS.forEach((p, i) => expect(fast.rooms[i]).toBeCloseTo(ref.rooms[p], 9));
  });

  it('cuts the same bench player as the reference when a low-ranked starter exists', () => {
    const { players, values } = playersOf([
      ['qb1', 'QB', 30], ['rb1', 'RB', 90], ['rb2', 'RB', 80], ['wr1', 'WR', 85], ['wr2', 'WR', 70],
      ['wr3', 'WR', 50], ['wr4', 'WR', 45], ['te1', 'TE', 60], ['x', 'RB', 75], ['y', 'TE', 48],
    ]);
    const ctx = makeLineupContext(STANDARD_SLOTS, DEFAULT_SETTINGS.depthWeights);
    const ids = sortByValue(Object.keys(players), values);
    const fast = new FastScorer(ids, players, values, ctx);
    const idx = (xs: string[]) => xs.map((id) => fast.indexOf.get(id)!).sort((a, b) => a - b);
    const mine = ['qb1', 'rb1', 'rb2', 'wr1', 'wr2', 'wr3', 'wr4', 'te1'];
    const ref = applyTrade(sortByValue(mine, values), ['rb2'], ['x', 'y'], 0, values, players, ctx);
    expect(ref.dropped).toEqual(['wr4']);
    const expected = scoreSorted(ref.roster, players, values, ctx);
    expect(fast.score(idx(mine), idx(['rb2']), idx(['x', 'y']), 1)).toBeCloseTo(expected.total, 9);
    POSITIONS.forEach((p, i) => expect(fast.rooms[i]).toBeCloseTo(expected.rooms[p], 9));
  });

  it('rejects unknown players and unsupported positions', () => {
    const ctx = makeLineupContext(STANDARD_SLOTS, []);
    const { players, values } = playersOf([['k1', 'QB', 10]]);
    expect(() => new FastScorer(['ghost'], players, values, ctx)).toThrow(/unknown player ghost/);
    const withKicker = { ...players, k1: { ...players.k1, position: 'K' as never } };
    expect(() => new FastScorer(['k1'], withKicker, values, ctx)).toThrow(/unsupported position K/);
  });

  it('matches the reference scorer on 2,000 random trades across layouts', () => {
    const { league, ranks } = syntheticLeague(9, 4, 14);
    const ids = league.teams.flatMap((t) => t.playerIds);
    const { values } = buildValues(ids, ranks, DEFAULT_SETTINGS);
    const rand = mulberry32(3);
    const pickSome = (from: string[]) =>
      from.filter(() => rand() < 0.2).slice(0, 1 + Math.floor(rand() * 3));

    for (const slots of layouts) {
      const ctx = makeLineupContext(slots, DEFAULT_SETTINGS.depthWeights);
      const fast = new FastScorer(sortByValue(ids, values), league.players, values, ctx);
      const idx = (xs: string[]) => xs.map((id) => fast.indexOf.get(id)!).sort((a, b) => a - b);
      const [a, b] = league.teams;

      for (let trial = 0; trial < 700; trial++) {
        const out = pickSome(a.playerIds);
        const inc = pickSome(b.playerIds);
        const openSpots = Math.floor(rand() * 2);
        const ref = applyTrade(sortByValue(a.playerIds, values), out, inc, openSpots, values, league.players, ctx);
        const expected = scoreSorted(ref.roster, league.players, values, ctx);
        const drops = Math.max(0, inc.length - out.length - openSpots);
        const got = fast.score(idx(a.playerIds), idx(out), idx(inc), drops);
        expect(got).toBeCloseTo(expected.total, 9);
        POSITIONS.forEach((p, i) => expect(fast.rooms[i]).toBeCloseTo(expected.rooms[p], 9));
      }
    }
  });
});
