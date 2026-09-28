import { describe, expect, it } from 'vitest';
import { makeLineupContext, maximalVectors, scoreByPos, scoreTeam } from '../../src/engine/lineup';
import { mulberry32, STANDARD_SLOTS } from '../../src/engine/synthetic';
import type { Position, Slot } from '../../src/engine/types';
import { playersOf } from '../helpers/build';

const SUPERFLEX: Slot[] = [...STANDARD_SLOTS, { name: 'SF', eligible: ['QB', 'RB', 'WR', 'TE'] }];

describe('maximalVectors', () => {
  it('lists the three ways to fill a standard lineup', () => {
    expect(makeLineupContext(STANDARD_SLOTS, []).vectors).toEqual([
      [1, 2, 2, 2],
      [1, 2, 3, 1],
      [1, 3, 2, 1],
    ]);
  });

  it('does not depend on slot order', () => {
    const flexFirst = [STANDARD_SLOTS[6], ...STANDARD_SLOTS.slice(0, 6)];
    expect(makeLineupContext(flexFirst, []).vectors).toEqual(makeLineupContext(STANDARD_SLOTS, []).vectors);
  });

  it('handles overlapping, non-nested flex slots', () => {
    // {RB,WR} and {WR,TE}
    expect(maximalVectors([[1, 2], [2, 3]])).toEqual([
      [0, 0, 1, 1],
      [0, 0, 2, 0],
      [0, 1, 0, 1],
      [0, 1, 1, 0],
    ]);
  });

  it('ignores slots with no known positions', () => {
    const ctx = makeLineupContext([{ name: 'K', eligible: ['K' as Position] }], []);
    expect(ctx.vectors).toEqual([[0, 0, 0, 0]]);
  });
});

describe('scoreTeam', () => {
  const ctx = makeLineupContext(STANDARD_SLOTS, [0.25, 0.1]);

  it('puts the best leftover RB/WR/TE in flex', () => {
    const { players, values } = playersOf([
      ['qb1', 'QB', 100], ['rb1', 'RB', 90], ['rb2', 'RB', 80], ['rb3', 'RB', 70],
      ['wr1', 'WR', 85], ['wr2', 'WR', 60], ['wr3', 'WR', 50], ['te1', 'TE', 40],
    ]);
    const s = scoreTeam(Object.keys(players), players, values, ctx);
    expect(new Set(s.starters)).toEqual(new Set(['qb1', 'rb1', 'rb2', 'rb3', 'wr1', 'wr2', 'te1']));
    // RB room: 90+80+70 starters, no RB bench. WR room: 85+60 starters + 0.25*50 depth.
    expect(s.rooms.RB).toBeCloseTo(240);
    expect(s.rooms.WR).toBeCloseTo(157.5);
    expect(s.total).toBeCloseTo(100 + 240 + 157.5 + 40);
  });

  it('credits only the first two bench players per position', () => {
    const { players, values } = playersOf([
      ['wr1', 'WR', 100], ['wr2', 'WR', 90], ['wr3', 'WR', 80],
      ['wr4', 'WR', 40], ['wr5', 'WR', 20], ['wr6', 'WR', 10],
    ]);
    const s = scoreTeam(Object.keys(players), players, values, ctx);
    // wr1-3 start (2 WR + flex); bench wr4 at 0.25, wr5 at 0.10, wr6 at 0.
    expect(s.rooms.WR).toBeCloseTo(270 + 10 + 2);
  });

  it('leaves slots empty when a position is missing', () => {
    const { players, values } = playersOf([['rb1', 'RB', 50]]);
    const s = scoreTeam(['rb1'], players, values, ctx);
    expect(s.total).toBeCloseTo(50);
    expect(s.rooms.QB).toBe(0);
  });

  it('breaks a flex tie toward the higher total with depth', () => {
    // wr3 and te2 are both worth 50. Flexing wr3 leaves bench depth 0.25*40 (wr4) + 0.25*50 (te2) = 22.5;
    // flexing te2 leaves 0.25*50 (wr3) + 0.10*40 (wr4) = 16.5. Starters are 535 either way.
    const { players, values } = playersOf([
      ['qb1', 'QB', 100], ['rb1', 'RB', 90], ['rb2', 'RB', 80],
      ['wr1', 'WR', 85], ['wr2', 'WR', 60], ['wr3', 'WR', 50], ['wr4', 'WR', 40],
      ['te1', 'TE', 70], ['te2', 'TE', 50],
    ]);
    const s = scoreTeam(Object.keys(players), players, values, ctx);
    expect(s.starters).toContain('wr3');
    expect(s.starters).not.toContain('te2');
    expect(s.total).toBeCloseTo(557.5);
  });

  it('starts a second QB in superflex when he beats the flex options', () => {
    const sf = makeLineupContext(SUPERFLEX, [0.25, 0.1]);
    const { players, values } = playersOf([
      ['qb1', 'QB', 100], ['qb2', 'QB', 90], ['rb1', 'RB', 50], ['rb2', 'RB', 40],
      ['rb3', 'RB', 30], ['wr1', 'WR', 45], ['wr2', 'WR', 35], ['te1', 'TE', 20],
    ]);
    const s = scoreTeam(Object.keys(players), players, values, sf);
    expect(s.starters).toContain('qb2');
  });

  it('picks RB + TE over WR in overlapping {RB,WR}/{WR,TE} slots', () => {
    const ctx2 = makeLineupContext(
      [
        { name: 'W/R', eligible: ['WR', 'RB'] },
        { name: 'W/T', eligible: ['WR', 'TE'] },
      ],
      [],
    );
    const s = scoreByPos([[], [90], [50], [80]], ctx2);
    expect(s.counts).toEqual([0, 1, 0, 1]);
    expect(s.starterValue).toBe(170);
  });
});

/**
 * Brute force: try every slot → position (or empty) assignment, taking the best unused player
 * each time. Returns the best starter value, and the best total (with depth) among lineups
 * that reach it — i.e. what the tie rule should pick.
 */
function oracle(byPos: number[][], slots: number[][], depthWeights: number[]): { starters: number; total: number } {
  let best = { starters: -1, total: -1 };
  const used = [0, 0, 0, 0];
  const rec = (i: number, acc: number) => {
    if (i === slots.length) {
      let total = acc;
      for (let p = 0; p < 4; p++) {
        for (let d = 0; d < depthWeights.length && used[p] + d < byPos[p].length; d++) {
          total += depthWeights[d] * byPos[p][used[p] + d];
        }
      }
      if (acc > best.starters || (acc === best.starters && total > best.total)) best = { starters: acc, total };
      return;
    }
    rec(i + 1, acc);
    for (const p of slots[i]) {
      if (used[p] < byPos[p].length) {
        const v = byPos[p][used[p]++];
        rec(i + 1, acc + v);
        used[p]--;
      }
    }
  };
  rec(0, 0);
  return best;
}

describe('lineup optimality (brute-force oracle)', () => {
  const POS: Position[] = ['QB', 'RB', 'WR', 'TE'];

  const randomCase = (rand: () => number, valueOf: () => number) => {
    const slots: Slot[] = Array.from({ length: 1 + Math.floor(rand() * 6) }, (_, i) => ({
      name: `S${i}`,
      eligible: POS.filter(() => rand() < 0.4).concat(POS[Math.floor(rand() * 4)]),
    }));
    const byPos = POS.map(() =>
      Array.from({ length: Math.floor(rand() * 5) }, valueOf).sort((a, b) => b - a),
    );
    const idx = slots.map((s) => [...new Set(s.eligible.map((p) => POS.indexOf(p)))]);
    return { slots, byPos, idx };
  };

  it('breaks ties like the oracle on 400 tie-heavy random cases', () => {
    const rand = mulberry32(11);
    for (let trial = 0; trial < 400; trial++) {
      // Values in steps of 10 make equal-value flex candidates common.
      const { slots, byPos, idx } = randomCase(rand, () => 10 * (1 + Math.floor(rand() * 5)));
      const s = scoreByPos(byPos, makeLineupContext(slots, [0.25, 0.1]));
      const o = oracle(byPos, idx, [0.25, 0.1]);
      expect(s.starterValue).toBe(o.starters);
      expect(s.total).toBeCloseTo(o.total, 9);
    }
  });

  it('matches the oracle on 400 random layouts and rosters', () => {
    const rand = mulberry32(7);
    for (let trial = 0; trial < 400; trial++) {
      const slots: Slot[] = Array.from({ length: 1 + Math.floor(rand() * 6) }, (_, i) => ({
        name: `S${i}`,
        eligible: POS.filter(() => rand() < 0.4).concat(POS[Math.floor(rand() * 4)]),
      }));
      const ctx = makeLineupContext(slots, [0.25, 0.1]);
      const byPos = POS.map(() =>
        Array.from({ length: Math.floor(rand() * 5) }, () => Math.round(rand() * 1000)).sort((a, b) => b - a),
      );
      const idx = slots.map((s) => [...new Set(s.eligible.map((p) => POS.indexOf(p)))]);
      expect(scoreByPos(byPos, ctx).starterValue).toBe(oracle(byPos, idx, []).starters);
    }
  });
});
