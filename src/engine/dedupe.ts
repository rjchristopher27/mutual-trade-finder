import { combinations } from './search';
import type { Trade, TradeGroup, Values } from './types';

function tradeKey(opponentId: string, give: string[], get: string[]): string {
  return `${opponentId}|${[...give].sort().join(',')}|${[...get].sort().join(',')}`;
}

/**
 * Drop a trade when a strictly smaller trade inside it scores within `tolerance` of it.
 * Sub-trades are looked up among ALL input trades, so in a chain T ⊂ T' ⊂ T'' each step is
 * judged against its own sub-trade even if that sub-trade is itself dropped. A bigger trade
 * whose sub-trades didn't qualify (they didn't help both teams) is always kept.
 */
export function removeFiller(trades: Trade[], tolerance: number): Trade[] {
  const byKey = new Map(trades.map((t) => [tradeKey(t.opponentId, t.give, t.get), t]));
  return trades.filter((t) => {
    if (t.give.length + t.get.length <= 2) return true;
    for (const g of combinations(t.give, t.give.length)) {
      for (const r of combinations(t.get, t.get.length)) {
        if (g.length === t.give.length && r.length === t.get.length) continue;
        const smaller = byKey.get(tradeKey(t.opponentId, g, r));
        if (smaller && t.score <= smaller.score * (1 + tolerance)) return false;
      }
    }
    return true;
  });
}

/** Group trades by opponent + highest-value player each way. Groups come out best-first. */
export function groupTrades(trades: Trade[], values: Values): TradeGroup[] {
  const top = (ids: string[]) => ids.reduce((a, b) => ((values[b] ?? 0) > (values[a] ?? 0) ? b : a));
  const groups = new Map<string, TradeGroup>();
  for (const t of [...trades].sort((a, b) => b.score - a.score)) {
    const key = `${t.opponentId}|${top(t.give)}|${top(t.get)}`;
    const g = groups.get(key);
    if (g) g.variants.push(t);
    else groups.set(key, { head: t, variants: [] });
  }
  return [...groups.values()];
}

export function topGroups(groups: TradeGroup[], perOpponent: number, limit: number): TradeGroup[] {
  const count = new Map<string, number>();
  const out: TradeGroup[] = [];
  for (const g of groups) {
    if (out.length >= limit) break;
    const n = count.get(g.head.opponentId) ?? 0;
    if (n >= perOpponent) continue;
    count.set(g.head.opponentId, n + 1);
    out.push(g);
  }
  return out;
}
