import { scoreSorted, sortByValue, type LineupContext } from './lineup';
import { rankLeague, type LeagueRanks } from './ranks';
import { applyTrade } from './trade';
import { POSITIONS, type League, type Position, type TeamScore, type Trade, type Values } from './types';

export interface RankChange {
  overall: [number, number];
  rooms: Record<Position, [number, number]>;
}

export interface TradeReport {
  trade: Trade;
  me: RankChange;
  them: RankChange;
  droppedMe: string[];
  droppedThem: string[];
}

export function reportTrade(
  league: League,
  values: Values,
  ctx: LineupContext,
  baseScores: Record<string, TeamScore>,
  baseRanks: LeagueRanks,
  myTeamId: string,
  trade: Trade,
): TradeReport {
  const me = league.teams.find((t) => t.id === myTeamId);
  const opp = league.teams.find((t) => t.id === trade.opponentId);
  if (!me || !opp) throw new Error(`Trade references an unknown team (${myTeamId} vs ${trade.opponentId})`);

  const mine = applyTrade(sortByValue(me.playerIds, values), trade.give, trade.get, me.openSpots, values, league.players, ctx);
  const theirs = applyTrade(sortByValue(opp.playerIds, values), trade.get, trade.give, opp.openSpots, values, league.players, ctx);
  const after = rankLeague({
    ...baseScores,
    [me.id]: scoreSorted(mine.roster, league.players, values, ctx),
    [opp.id]: scoreSorted(theirs.roster, league.players, values, ctx),
  });

  const change = (id: string): RankChange => ({
    overall: [baseRanks.overall[id], after.overall[id]],
    rooms: Object.fromEntries(
      POSITIONS.map((p) => [p, [baseRanks.rooms[p][id], after.rooms[p][id]]]),
    ) as Record<Position, [number, number]>,
  });

  return {
    trade,
    me: change(me.id),
    them: change(opp.id),
    droppedMe: mine.dropped,
    droppedThem: theirs.dropped,
  };
}
