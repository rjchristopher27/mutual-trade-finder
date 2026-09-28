import { EPS, POS_INDEX, type LineupContext } from './lineup';
import type { Player, Values } from './types';

/** Max players a FastScorer roster can hold (roster + incoming). */
export const FAST_CAPACITY = 128;
const EMPTY_LINEUP: readonly number[] = [0, 0, 0, 0];

/**
 * Allocation-free team scorer for the search hot loop. Players are integer
 * indexes assigned in value order (index 0 = most valuable), so "sorted by
 * value" is just ascending index order. Must agree exactly with scoreSorted +
 * applyTrade, including the tie rule and the bench-first drop rule.
 */
export class FastScorer {
  readonly ids: string[];
  readonly indexOf: Map<string, number>;
  /** Room scores from the most recent score() call, by position index. Overwritten by the next call. */
  readonly rooms = new Float64Array(4);
  private readonly posOf: Int8Array;
  private readonly valOf: Float64Array;
  private readonly merged = new Int32Array(FAST_CAPACITY);
  /** For merged[k]: its rank within its position (0 = best at that position). */
  private readonly posRank = new Int32Array(FAST_CAPACITY);
  private readonly dropMark = new Uint8Array(FAST_CAPACITY);
  private readonly byPos = [0, 1, 2, 3].map(() => new Float64Array(FAST_CAPACITY));
  private readonly len = new Int32Array(4);
  private readonly roomTmp = new Float64Array(4);
  private readonly bestCounts = new Int32Array(4);
  private starterTmp = 0;

  constructor(
    sortedIds: string[],
    players: Record<string, Player>,
    values: Values,
    private readonly ctx: LineupContext,
  ) {
    for (const id of sortedIds) {
      const player = players[id];
      if (!player) throw new Error(`FastScorer: unknown player ${id}`);
      if (POS_INDEX[player.position] === undefined) {
        throw new Error(`FastScorer: player ${id} has unsupported position ${player.position}`);
      }
    }
    this.ids = sortedIds;
    this.indexOf = new Map(sortedIds.map((id, i) => [id, i]));
    this.posOf = Int8Array.from(sortedIds, (id) => POS_INDEX[players[id].position]);
    this.valOf = Float64Array.from(sortedIds, (id) => values[id] ?? 0);
  }

  /**
   * Score `base` minus `out` plus `add`, then cut `drops` players: lowest-value bench players
   * first (outside the best lineup), starters only if the bench runs out.
   * base and add must be ascending index arrays; out has at most a few entries.
   */
  score(base: number[], out: number[], add: number[], drops: number): number {
    const { merged } = this;
    let n = 0;
    let j = 0;
    for (const i of base) {
      if (out.includes(i)) continue;
      while (j < add.length && add[j] < i) merged[n++] = add[j++];
      merged[n++] = i;
    }
    while (j < add.length) merged[n++] = add[j++];

    this.fill(n);
    const total = this.best();
    if (drops <= 0) return total;

    const { dropMark, posRank, posOf, bestCounts } = this;
    dropMark.fill(0, 0, n);
    let need = drops;
    for (let k = n - 1; k >= 0 && need > 0; k--) {
      if (posRank[k] >= bestCounts[posOf[merged[k]]]) {
        dropMark[k] = 1;
        need--;
      }
    }
    for (let k = n - 1; k >= 0 && need > 0; k--) {
      if (!dropMark[k]) {
        dropMark[k] = 1;
        need--;
      }
    }
    let m = 0;
    for (let k = 0; k < n; k++) if (!dropMark[k]) merged[m++] = merged[k];
    this.fill(m);
    return this.best();
  }

  /** Split merged[0..n) into per-position value lists, recording each player's rank at its position. */
  private fill(n: number): void {
    const { merged, byPos, len, posOf, valOf, posRank } = this;
    len.fill(0);
    for (let k = 0; k < n; k++) {
      const p = posOf[merged[k]];
      posRank[k] = len[p];
      byPos[p][len[p]++] = valOf[merged[k]];
    }
  }

  /** Same order and tie rule as scoreByPos: the empty lineup first, then each vector. */
  private best(): number {
    const { len, bestCounts } = this;
    let bestTotal = this.evaluate(EMPTY_LINEUP);
    let bestStarters = this.starterTmp;
    this.rooms.set(this.roomTmp);
    bestCounts.fill(0);
    for (const v of this.ctx.vectors) {
      const total = this.evaluate(v);
      const starters = this.starterTmp;
      if (starters > bestStarters + EPS || (starters > bestStarters - EPS && total > bestTotal + EPS)) {
        bestStarters = starters;
        bestTotal = total;
        this.rooms.set(this.roomTmp);
        for (let p = 0; p < 4; p++) bestCounts[p] = Math.min(v[p], len[p]);
      }
    }
    return bestTotal;
  }

  /** Total for starter counts min(v, available); leaves rooms in roomTmp and starter value in starterTmp. */
  private evaluate(v: readonly number[]): number {
    const { byPos, len, roomTmp } = this;
    const w = this.ctx.depthWeights;
    let total = 0;
    let starters = 0;
    for (let p = 0; p < 4; p++) {
      const vals = byPos[p];
      const c = Math.min(v[p], len[p]);
      let room = 0;
      for (let i = 0; i < c; i++) room += vals[i];
      starters += room;
      for (let d = 0; d < w.length && c + d < len[p]; d++) room += w[d] * vals[c + d];
      roomTmp[p] = room;
      total += room;
    }
    this.starterTmp = starters;
    return total;
  }
}
