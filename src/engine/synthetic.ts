import type { League, Player, PlayerRanks, Position, Slot } from './types';

export const STANDARD_SLOTS: Slot[] = [
  { name: 'QB', eligible: ['QB'] },
  { name: 'RB', eligible: ['RB'] },
  { name: 'RB', eligible: ['RB'] },
  { name: 'WR', eligible: ['WR'] },
  { name: 'WR', eligible: ['WR'] },
  { name: 'TE', eligible: ['TE'] },
  { name: 'W/R/T', eligible: ['WR', 'RB', 'TE'] },
];

/** Deterministic PRNG so synthetic leagues are identical on every run. */
export function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A snake-drafted redraft league with positional caps, ranked by two fake creators. */
export function syntheticLeague(
  seed: number,
  teamCount = 12,
  rosterSize = 15,
  slots: Slot[] = STANDARD_SLOTS,
): { league: League; ranks: Record<string, PlayerRanks> } {
  const rand = mulberry32(seed);
  const pool: Player[] = [];
  const ranks: Record<string, PlayerRanks> = {};
  for (let i = 0; i < teamCount * rosterSize * 2; i++) {
    const r = rand();
    const position: Position = r < 0.12 ? 'QB' : r < 0.42 ? 'RB' : r < 0.85 ? 'WR' : 'TE';
    const id = `p${i + 1}`;
    pool.push({ id, name: `${position} Player ${i + 1}`, position, nflTeam: 'FA', injured: false });
    const noise = () => Math.max(1, i + 1 + Math.round((rand() - 0.5) * 20));
    ranks[id] = { consensus: i + 1, byCreator: { Alpha: noise(), Beta: noise() } };
  }

  const caps: Record<Position, number> = { QB: 2, RB: 5, WR: 6, TE: 2 };
  const rosters: Player[][] = Array.from({ length: teamCount }, () => []);
  const taken = new Set<string>();
  for (let round = 0; round < rosterSize; round++) {
    const order = [...Array(teamCount).keys()];
    if (round % 2 === 1) order.reverse();
    for (const t of order) {
      const count = (pos: Position) => rosters[t].filter((p) => p.position === pos).length;
      const pick = pool.find((p) => !taken.has(p.id) && count(p.position) < caps[p.position]);
      if (!pick) {
        const max = Object.values(caps).reduce((a, b) => a + b, 0);
        throw new Error(`Cannot fill a ${rosterSize}-man roster: positional caps allow ${max}`);
      }
      taken.add(pick.id);
      rosters[t].push(pick);
    }
  }

  const players: Record<string, Player> = {};
  for (const p of pool) if (taken.has(p.id)) players[p.id] = p;
  return {
    league: {
      id: `synthetic-${seed}`,
      name: `Synthetic League ${seed}`,
      slots,
      teams: rosters.map((r, i) => ({
        id: `t${i + 1}`,
        name: `Team ${i + 1}`,
        playerIds: r.map((p) => p.id),
        openSpots: 1,
      })),
      players,
    },
    ranks,
  };
}
