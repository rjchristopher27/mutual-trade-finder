import { describe, expect, it } from 'vitest';
import { makeLineupContext, sortByValue } from '../../src/engine/lineup';
import { STANDARD_SLOTS } from '../../src/engine/synthetic';
import { applyTrade, pickDrops } from '../../src/engine/trade';
import type { Slot } from '../../src/engine/types';
import { playersOf } from '../helpers/build';

// One WR slot: a, b, c, d, x, y, z are all WRs, so only the best one starts.
const ONE_WR: Slot[] = [{ name: 'WR', eligible: ['WR'] }];
const { players, values } = playersOf([
  ['a', 'WR', 100], ['b', 'WR', 80], ['c', 'WR', 60], ['d', 'WR', 40],
  ['x', 'WR', 90], ['y', 'WR', 50], ['z', 'WR', 10],
]);
const ctx = makeLineupContext(ONE_WR, []);
const trade = (base: string[], out: string[], inc: string[], open: number) =>
  applyTrade(base, out, inc, open, values, players, ctx);

describe('applyTrade', () => {
  it('swaps players and keeps value order', () => {
    const { roster, dropped } = trade(['a', 'b', 'c', 'd'], ['b'], ['x'], 0);
    expect(roster).toEqual(['a', 'x', 'c', 'd']);
    expect(dropped).toEqual([]);
  });

  it('drops the lowest-value bench players when the roster overflows', () => {
    const { roster, dropped } = trade(['a', 'b', 'c', 'd'], ['a'], ['x', 'y', 'z'], 1);
    // net +2 with 1 open spot → 1 drop: the lowest-value bench player (z).
    expect(roster).toEqual(['x', 'b', 'c', 'y', 'd']);
    expect(dropped).toEqual(['z']);
  });

  it('merges equal-value players in id order, matching sortByValue', () => {
    const tied = { m: 50, p: 50, n: 50, a: 90 };
    const tiedPlayers = playersOf([['m', 'WR', 50], ['p', 'WR', 50], ['n', 'WR', 50], ['a', 'WR', 90]]).players;
    const { roster } = applyTrade(sortByValue(['a', 'm', 'p'], tied), ['a'], ['n'], 0, tied, tiedPlayers, ctx);
    expect(roster).toEqual(sortByValue(['m', 'p', 'n'], tied));
    expect(roster).toEqual(['m', 'n', 'p']);
  });

  it('can drop one of my own bench players rather than an incoming one', () => {
    const { roster, dropped } = trade(['a', 'b', 'c', 'd'], ['c'], ['x', 'y'], 0);
    // x (90) and y (50) both beat d (40), so d is the player cut.
    expect(roster).toEqual(['a', 'x', 'b', 'y']);
    expect(dropped).toEqual(['d']);
  });

  it('does not drop when there is room', () => {
    const { dropped } = trade(['a', 'b'], ['a'], ['x', 'y'], 1);
    expect(dropped).toEqual([]);
  });

  it('cuts a bench player, not a low-ranked starter', () => {
    // Full roster whose only QB (30) is worth less than its bench WRs (50, 45).
    const lg = playersOf([
      ['qb1', 'QB', 30], ['rb1', 'RB', 90], ['rb2', 'RB', 80], ['wr1', 'WR', 85], ['wr2', 'WR', 70],
      ['wr3', 'WR', 50], ['wr4', 'WR', 45], ['te1', 'TE', 60], ['x', 'RB', 75], ['y', 'TE', 48],
    ]);
    const std = makeLineupContext(STANDARD_SLOTS, [0.25, 0.1]);
    const base = sortByValue(['qb1', 'rb1', 'rb2', 'wr1', 'wr2', 'wr3', 'wr4', 'te1'], lg.values);
    const { roster, dropped } = applyTrade(base, ['rb2'], ['x', 'y'], 0, lg.values, lg.players, std);
    // Starters after the trade: qb1, rb1, x, wr1, wr2, te1, wr3 (flex). Bench: y 48, wr4 45 → cut wr4.
    expect(dropped).toEqual(['wr4']);
    expect(roster).toContain('qb1');
  });
});

describe('pickDrops', () => {
  it('falls back to starters only when the bench runs out', () => {
    expect(pickDrops(['a', 'b', 'c'], 2, (id) => id !== 'c')).toEqual(['c', 'b']);
  });
});
