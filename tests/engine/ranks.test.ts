import { describe, expect, it } from 'vitest';
import { makeLineupContext } from '../../src/engine/lineup';
import { rankLeague, rankOf, scoreLeague } from '../../src/engine/ranks';
import type { Slot } from '../../src/engine/types';
import { leagueOf } from '../helpers/build';

describe('rankOf', () => {
  it('ranks descending and lets ties share the better rank', () => {
    expect(rankOf({ a: 10, b: 30, c: 30, d: 5 })).toEqual({ a: 3, b: 1, c: 1, d: 4 });
  });

  it('treats float-noise differences as ties', () => {
    expect(rankOf({ a: 1000, b: 1000 + 1e-12, c: 999 })).toEqual({ a: 1, b: 1, c: 3 });
  });
});

describe('rankLeague', () => {
  it('ranks rooms and overall in a 5-team toy league', () => {
    const slots: Slot[] = [
      { name: 'QB', eligible: ['QB'] },
      { name: 'WR', eligible: ['WR'] },
    ];
    const { league, values } = leagueOf(slots, {
      A: [['a1', 'QB', 100], ['a2', 'WR', 10]],
      B: [['b1', 'QB', 50], ['b2', 'WR', 90]],
      C: [['c1', 'QB', 70], ['c2', 'WR', 70]],
      D: [['d1', 'QB', 20], ['d2', 'WR', 20]],
      E: [['e1', 'QB', 70]],
    });
    const ranks = rankLeague(scoreLeague(league, values, makeLineupContext(slots, [])));
    // C and E tie at 70 in the QB room; E has no WR, so its WR room is 0 (last).
    expect(ranks.rooms.QB).toEqual({ A: 1, B: 4, C: 2, D: 5, E: 2 });
    expect(ranks.rooms.WR).toEqual({ A: 4, B: 1, C: 2, D: 3, E: 5 });
    // Totals: A 110, B 140, C 140, D 40, E 70 → B and C share #1.
    expect(ranks.overall).toEqual({ A: 3, B: 1, C: 1, D: 5, E: 4 });
  });
});
