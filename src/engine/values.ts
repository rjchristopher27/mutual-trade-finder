import type { PlayerRanks, Values } from './types';

export function rankToValue(rank: number, k: number): number {
  return 1000 * Math.exp(-k * rank);
}

export interface BuiltValues {
  values: Values;
  /** Players the selected creator didn't rank (valued from consensus instead). */
  fallbacks: Set<string>;
  /** Players with no ranks at all (valued at 0). */
  unranked: Set<string>;
}

export function buildValues(
  playerIds: string[],
  ranks: Record<string, PlayerRanks>,
  opts: { k: number; creator: string | null },
): BuiltValues {
  const values: Values = {};
  const fallbacks = new Set<string>();
  const unranked = new Set<string>();
  for (const id of playerIds) {
    const r = ranks[id];
    if (!r) {
      values[id] = 0;
      unranked.add(id);
      continue;
    }
    let rank = r.consensus;
    if (opts.creator !== null) {
      const creatorRank = r.byCreator[opts.creator];
      if (creatorRank === undefined) fallbacks.add(id);
      else rank = creatorRank;
    }
    values[id] = rankToValue(rank, opts.k);
  }
  return { values, fallbacks, unranked };
}
