import { groupTrades, removeFiller, topGroups } from './dedupe';
import { makeLineupContext } from './lineup';
import { rankLeague, scoreLeague, type LeagueRanks } from './ranks';
import { reportTrade, type TradeReport } from './report';
import { findTrades, rescore } from './search';
import type { EngineSettings, League, PlayerRanks, Trade, TradeGroup, Values } from './types';
import { buildValues } from './values';

export * from './types';
export type { LeagueRanks } from './ranks';
export type { RankChange, TradeReport } from './report';

/** Settings that only affect ranking and cleanup — safe to change without searching again. */
export type ViewSettings = Pick<EngineSettings, 'alpha' | 'fillerTolerance' | 'perOpponentCap' | 'limit'>;

export interface EngineResult {
  /** The team the trades were found for. */
  myTeamId: string;
  /** The settings the search ran with. */
  settings: EngineSettings;
  values: Values;
  /** Every trade that helps both teams (before cleanup) — kept so the alpha slider can re-sort without searching again. */
  trades: Trade[];
  groups: TradeGroup[];
  /** One report per group head, same order as `groups`. */
  reports: TradeReport[];
  baseRanks: LeagueRanks;
  fallbacks: string[];
  unranked: string[];
}

export function finalize(
  league: League,
  values: Values,
  myTeamId: string,
  trades: Trade[],
  settings: EngineSettings,
): Pick<EngineResult, 'groups' | 'reports' | 'baseRanks'> {
  const ctx = makeLineupContext(league.slots, settings.depthWeights);
  const baseScores = scoreLeague(league, values, ctx);
  const baseRanks = rankLeague(baseScores);
  const cleaned = removeFiller(trades, settings.fillerTolerance);
  const groups = topGroups(groupTrades(cleaned, values), settings.perOpponentCap, settings.limit);
  const reports = groups.map((g) =>
    reportTrade(league, values, ctx, baseScores, baseRanks, myTeamId, g.head),
  );
  return { groups, reports, baseRanks };
}

export function runEngine(
  league: League,
  ranks: Record<string, PlayerRanks>,
  myTeamId: string,
  settings: EngineSettings,
): EngineResult {
  const allIds = league.teams.flatMap((t) => t.playerIds);
  const { values, fallbacks, unranked } = buildValues(allIds, ranks, settings);
  const trades = findTrades({ league, values, myTeamId, settings });
  return {
    myTeamId,
    settings,
    values,
    trades,
    ...finalize(league, values, myTeamId, trades, settings),
    fallbacks: [...fallbacks],
    unranked: [...unranked],
  };
}

/**
 * Re-rank for new view settings (favor-me alpha, cleanup caps) without re-running the search.
 * Anything that changes values or which trades qualify needs a new runEngine call instead.
 */
export function reweight(league: League, result: EngineResult, view: ViewSettings): EngineResult {
  // Copy only the view fields: callers may pass a whole settings object, and anything else
  // (k, creator, depthWeights, filters) would silently disagree with the stored trades.
  const { alpha, fillerTolerance, perOpponentCap, limit } = view;
  const settings = { ...result.settings, alpha, fillerTolerance, perOpponentCap, limit };
  const trades = rescore(result.trades, alpha);
  return {
    ...result,
    settings,
    trades,
    ...finalize(league, result.values, result.myTeamId, trades, settings),
  };
}
