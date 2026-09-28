import type { Player, Position, Slot, TeamScore, Values } from './types';

export const POS_INDEX: Record<Position, number> = { QB: 0, RB: 1, WR: 2, TE: 3 };

/** Float tolerance for comparing lineup totals, so tie-breaking is deterministic. */
export const EPS = 1e-9;

export interface LineupContext {
  /**
   * Maximal feasible starter-count vectors [QB, RB, WR, TE] for the slot layout.
   * Any legal lineup's counts are ≤ one of these, so scoring only needs to try them.
   */
  vectors: number[][];
  depthWeights: number[];
}

export function makeLineupContext(slots: Slot[], depthWeights: number[]): LineupContext {
  const idx = slots
    .map((s) => [
      ...new Set(s.eligible.map((p) => POS_INDEX[p]).filter((i): i is number => i !== undefined)),
    ])
    .filter((e) => e.length > 0);
  return { vectors: maximalVectors(idx), depthWeights };
}

/** Hall's condition: every set of positions needs at least as many slots as players chosen from it. */
export function feasible(counts: number[], slots: number[][]): boolean {
  for (let mask = 1; mask < 16; mask++) {
    let need = 0;
    for (let p = 0; p < 4; p++) if ((mask >> p) & 1) need += counts[p];
    if (need === 0) continue;
    let avail = 0;
    for (const s of slots) if (s.some((p) => (mask >> p) & 1)) avail++;
    if (need > avail) return false;
  }
  return true;
}

/** All feasible starter-count vectors that no other feasible vector dominates, in a fixed order. */
export function maximalVectors(slots: number[][]): number[][] {
  const n = slots.length;
  const all: number[][] = [];
  for (let a = 0; a <= n; a++)
    for (let b = 0; a + b <= n; b++)
      for (let c = 0; a + b + c <= n; c++)
        for (let d = 0; a + b + c + d <= n; d++) {
          const v = [a, b, c, d];
          if (feasible(v, slots)) all.push(v);
        }
  const dominates = (w: number[], v: number[]) =>
    w.every((x, i) => x >= v[i]) && w.some((x, i) => x > v[i]);
  return all.filter((v) => !all.some((w) => dominates(w, v)));
}

export interface PosScore {
  total: number;
  starterValue: number;
  rooms: number[];
  counts: number[];
}

function evaluate(byPos: number[][], counts: number[], depthWeights: number[]): PosScore {
  const rooms = [0, 0, 0, 0];
  let total = 0;
  let starterValue = 0;
  for (let p = 0; p < 4; p++) {
    const vals = byPos[p];
    let room = 0;
    for (let i = 0; i < counts[p]; i++) room += vals[i];
    starterValue += room;
    for (let d = 0; d < depthWeights.length && counts[p] + d < vals.length; d++) {
      room += depthWeights[d] * vals[counts[p] + d];
    }
    rooms[p] = room;
    total += room;
  }
  return { total, starterValue, rooms, counts };
}

/**
 * Best lineup for players grouped by position (each list sorted descending).
 * Tie rule: highest starter value, then highest total including depth, then first vector.
 */
export function scoreByPos(byPos: number[][], ctx: LineupContext): PosScore {
  let best = evaluate(byPos, [0, 0, 0, 0], ctx.depthWeights);
  for (const v of ctx.vectors) {
    const counts = v.map((c, p) => Math.min(c, byPos[p].length));
    const s = evaluate(byPos, counts, ctx.depthWeights);
    if (
      s.starterValue > best.starterValue + EPS ||
      (s.starterValue > best.starterValue - EPS && s.total > best.total + EPS)
    ) {
      best = s;
    }
  }
  return best;
}

/** Sort ids by value descending; ties broken by id so order is deterministic. */
export function sortByValue(ids: string[], values: Values): string[] {
  return [...ids].sort((a, b) => (values[b] ?? 0) - (values[a] ?? 0) || (a < b ? -1 : a > b ? 1 : 0));
}

/** Score a roster that is already sorted by sortByValue. */
export function scoreSorted(
  sortedIds: string[],
  players: Record<string, Player>,
  values: Values,
  ctx: LineupContext,
): TeamScore {
  const idsBy: string[][] = [[], [], [], []];
  const valsBy: number[][] = [[], [], [], []];
  for (const id of sortedIds) {
    const player = players[id];
    if (!player) continue;
    const i = POS_INDEX[player.position];
    idsBy[i].push(id);
    valsBy[i].push(values[id] ?? 0);
  }
  const s = scoreByPos(valsBy, ctx);
  const starters = idsBy.flatMap((ids, p) => ids.slice(0, s.counts[p]));
  return {
    total: s.total,
    rooms: { QB: s.rooms[0], RB: s.rooms[1], WR: s.rooms[2], TE: s.rooms[3] },
    starters,
  };
}

export function scoreTeam(
  ids: string[],
  players: Record<string, Player>,
  values: Values,
  ctx: LineupContext,
): TeamScore {
  return scoreSorted(sortByValue(ids, values), players, values, ctx);
}
