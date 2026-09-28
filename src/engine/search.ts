import { FAST_CAPACITY, FastScorer } from './fast';
import { EPS, makeLineupContext, POS_INDEX, sortByValue } from './lineup';
import type { EngineSettings, League, Trade, Values } from './types';

/** Every non-empty combination of up to maxSize items, preserving input order. */
export function combinations<T>(items: T[], maxSize: number): T[][] {
  const out: T[][] = [];
  const cur: T[] = [];
  const rec = (start: number) => {
    if (cur.length > 0) out.push([...cur]);
    if (cur.length === maxSize) return;
    for (let i = start; i < items.length; i++) {
      cur.push(items[i]);
      rec(i + 1);
      cur.pop();
    }
  };
  rec(0);
  return out;
}

export function nashScore(gainMe: number, gainThem: number, alpha: number): number {
  return Math.pow(gainMe, alpha) * Math.pow(gainThem, 1 - alpha);
}

export function rescore(trades: Trade[], alpha: number): Trade[] {
  return trades
    .map((t) => ({ ...t, score: nashScore(t.gainMe, t.gainThem, alpha) }))
    .sort((a, b) => b.score - a.score);
}

export interface SearchInput {
  league: League;
  values: Values;
  myTeamId: string;
  settings: EngineSettings;
}

/** Every trade that raises both teams' scores past the minimum gain, best score first. */
export function findTrades({ league, values, myTeamId, settings }: SearchInput): Trade[] {
  const ctx = makeLineupContext(league.slots, settings.depthWeights);
  const me = league.teams.find((t) => t.id === myTeamId);
  if (!me) throw new Error(`Unknown team ${myTeamId}`);
  if (settings.mustInclude !== null && !me.playerIds.includes(settings.mustInclude)) {
    throw new Error(`mustInclude player ${settings.mustInclude} is not on team ${myTeamId}`);
  }
  if (settings.mustInclude !== null && settings.untouchable.includes(settings.mustInclude)) {
    throw new Error(`mustInclude player ${settings.mustInclude} is also untouchable`);
  }
  for (const t of league.teams) {
    const unknown = t.playerIds.find((id) => !league.players[id]);
    if (unknown) throw new Error(`Team ${t.id} lists ${unknown}, which has no player data`);
    if (t.playerIds.length + settings.maxPerSide > FAST_CAPACITY) {
      throw new Error(`Team ${t.id} roster is too large for the scorer (${t.playerIds.length} players)`);
    }
  }

  const allIds = league.teams.flatMap((t) => t.playerIds);
  const fast = new FastScorer(sortByValue(allIds, values), league.players, values, ctx);
  const toIdx = (ids: string[]) =>
    ids.filter((id) => fast.indexOf.has(id)).map((id) => fast.indexOf.get(id)!).sort((a, b) => a - b);
  const toIds = (idx: number[]) => idx.map((i) => fast.ids[i]);

  const myBase = toIdx(me.playerIds);
  const myTotal = fast.score(myBase, [], [], 0);
  const target = settings.targetPosition === null ? -1 : POS_INDEX[settings.targetPosition];
  const myTargetRoom = target >= 0 ? fast.rooms[target] : 0;
  const untouchable = new Set(toIdx(settings.untouchable));
  // Validated above: mustInclude is on my roster and every roster id has player data.
  const must = settings.mustInclude === null ? null : fast.indexOf.get(settings.mustInclude)!;
  const myBundles = combinations(
    myBase.filter((i) => !untouchable.has(i)),
    settings.maxPerSide,
  ).filter((b) => must === null || b.includes(must));
  const minMe = settings.minGainPct * myTotal;

  const trades: Trade[] = [];
  for (const opp of league.teams) {
    if (opp.id === myTeamId) continue;
    const oppBase = toIdx(opp.playerIds);
    const oppTotal = fast.score(oppBase, [], [], 0);
    const theirBundles = combinations(oppBase, settings.maxPerSide);
    const minThem = settings.minGainPct * oppTotal;

    for (const give of myBundles) {
      for (const get of theirBundles) {
        const net = get.length - give.length;
        const gainMe = fast.score(myBase, give, get, Math.max(0, net - me.openSpots)) - myTotal;
        if (gainMe <= EPS || gainMe < minMe) continue;
        if (target >= 0 && fast.rooms[target] <= myTargetRoom + EPS) continue;

        const gainThem = fast.score(oppBase, get, give, Math.max(0, -net - opp.openSpots)) - oppTotal;
        if (gainThem <= EPS || gainThem < minThem) continue;

        trades.push({
          opponentId: opp.id,
          give: toIds(give),
          get: toIds(get),
          gainMe,
          gainThem,
          score: nashScore(gainMe, gainThem, settings.alpha),
        });
      }
    }
  }
  return trades.sort((a, b) => b.score - a.score);
}
