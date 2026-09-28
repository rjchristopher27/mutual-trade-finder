import { scoreSorted, sortByValue, type LineupContext } from './lineup';
import type { Player, Values } from './types';

function before(a: string, b: string, values: Values): boolean {
  const d = (values[b] ?? 0) - (values[a] ?? 0);
  return d < 0 || (d === 0 && a < b);
}

/**
 * Which `count` players to cut from a value-sorted roster: the lowest-value non-starters first,
 * then (only if the bench runs out) the lowest-value starters. Returned lowest-value first.
 */
export function pickDrops(roster: string[], count: number, isStarter: (id: string) => boolean): string[] {
  const dropped: string[] = [];
  for (let i = roster.length - 1; i >= 0 && dropped.length < count; i--) {
    if (!isStarter(roster[i])) dropped.push(roster[i]);
  }
  for (let i = roster.length - 1; i >= 0 && dropped.length < count; i--) {
    if (!dropped.includes(roster[i])) dropped.push(roster[i]);
  }
  return dropped;
}

/**
 * Roster after a trade, kept in sortByValue order. If the team ends up over its roster
 * limit, it drops its lowest-value bench players (players outside its best post-trade lineup).
 */
export function applyTrade(
  sortedIds: string[],
  out: string[],
  incoming: string[],
  openSpots: number,
  values: Values,
  players: Record<string, Player>,
  ctx: LineupContext,
): { roster: string[]; dropped: string[] } {
  const outSet = new Set(out);
  const add = sortByValue(incoming, values);
  const roster: string[] = [];
  let j = 0;
  for (const id of sortedIds) {
    if (outSet.has(id)) continue;
    while (j < add.length && before(add[j], id, values)) roster.push(add[j++]);
    roster.push(id);
  }
  while (j < add.length) roster.push(add[j++]);

  const over = incoming.length - out.length - openSpots;
  if (over <= 0) return { roster, dropped: [] };
  const starters = new Set(scoreSorted(roster, players, values, ctx).starters);
  const dropped = pickDrops(roster, over, (id) => starters.has(id));
  const dropSet = new Set(dropped);
  return { roster: roster.filter((id) => !dropSet.has(id)), dropped };
}
