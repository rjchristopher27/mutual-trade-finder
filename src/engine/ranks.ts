import { EPS, scoreTeam, type LineupContext } from './lineup';
import { POSITIONS, type League, type Position, type TeamScore, type Values } from './types';

export interface LeagueRanks {
  overall: Record<string, number>;
  rooms: Record<Position, Record<string, number>>;
}

/**
 * Competition ranking: 1 + number of teams ahead by more than EPS, so ties (including
 * float-noise ties) share the better rank.
 */
export function rankOf(scores: Record<string, number>): Record<string, number> {
  const all = Object.values(scores);
  return Object.fromEntries(
    Object.entries(scores).map(([id, s]) => [id, 1 + all.filter((v) => v > s + EPS).length]),
  );
}

export function scoreLeague(league: League, values: Values, ctx: LineupContext): Record<string, TeamScore> {
  return Object.fromEntries(
    league.teams.map((t) => [t.id, scoreTeam(t.playerIds, league.players, values, ctx)]),
  );
}

export function rankLeague(scores: Record<string, TeamScore>): LeagueRanks {
  const pick = (f: (s: TeamScore) => number) =>
    rankOf(Object.fromEntries(Object.entries(scores).map(([id, s]) => [id, f(s)])));
  const rooms = Object.fromEntries(POSITIONS.map((p) => [p, pick((s) => s.rooms[p])])) as Record<
    Position,
    Record<string, number>
  >;
  return { overall: pick((s) => s.total), rooms };
}
