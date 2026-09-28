import type { League, Player, Position, Slot, Team, Values } from '../../src/engine/types';

/** Shorthand roster spec: [id, position, value]. */
export type Spec = [string, Position, number];

export function playersOf(...rosters: Spec[][]): { players: Record<string, Player>; values: Values } {
  const players: Record<string, Player> = {};
  const values: Values = {};
  for (const [id, position, value] of rosters.flat()) {
    players[id] = { id, name: id, position, nflTeam: 'FA', injured: false };
    values[id] = value;
  }
  return { players, values };
}

export function leagueOf(slots: Slot[], teams: Record<string, Spec[]>, openSpots = 0): { league: League; values: Values } {
  const { players, values } = playersOf(...Object.values(teams));
  const teamList: Team[] = Object.entries(teams).map(([id, specs]) => ({
    id,
    name: id,
    playerIds: specs.map(([pid]) => pid),
    openSpots,
  }));
  return { league: { id: 'L', name: 'L', slots, teams: teamList, players }, values };
}
