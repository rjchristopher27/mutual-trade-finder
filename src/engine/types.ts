export type Position = 'QB' | 'RB' | 'WR' | 'TE';
export const POSITIONS: readonly Position[] = ['QB', 'RB', 'WR', 'TE'];

export interface Player {
  id: string;
  name: string;
  position: Position;
  /** Display only — the engine never reads it. */
  nflTeam: string;
  /** Display only — the engine does not discount injured players; the UI flags them. */
  injured: boolean;
}

export interface Slot {
  name: string;
  eligible: Position[];
}

export interface Team {
  id: string;
  name: string;
  /** Tradeable QB/RB/WR/TE players only. */
  playerIds: string[];
  /** Empty roster spots before any trade (roster size minus every rostered player, incl. K/DEF). */
  openSpots: number;
}

export interface League {
  id: string;
  name: string;
  slots: Slot[];
  teams: Team[];
  players: Record<string, Player>;
}

/** Ranks for one league player, already keyed by league player id. */
export interface PlayerRanks {
  consensus: number;
  byCreator: Record<string, number>;
}

export type Values = Record<string, number>;

export interface TeamScore {
  total: number;
  rooms: Record<Position, number>;
  starters: string[];
}

export interface Trade {
  opponentId: string;
  give: string[];
  get: string[];
  /** Absolute change in my team score (value points, not a percentage). */
  gainMe: number;
  /** Absolute change in the opponent's team score (value points). */
  gainThem: number;
  /** Nash score: gainMe^alpha × gainThem^(1−alpha). */
  score: number;
}

export interface TradeGroup {
  head: Trade;
  variants: Trade[];
}

export interface EngineSettings {
  /** Value decay per rank: value = 1000 × e^(−k × rank). Bigger k = steeper stud premium. */
  k: number;
  /** Key into PlayerRanks.byCreator; null = consensus. */
  creator: string | null;
  /** Bench credit per position: [1st backup, 2nd backup, ...] as fractions of value. */
  depthWeights: number[];
  /** Max players on each side of a trade (1..maxPerSide). */
  maxPerSide: number;
  /** Minimum gain as a FRACTION of the team's pre-trade score (0.01 = 1%). */
  minGainPct: number;
  /** Favor-me weight in the Nash score: 0.5 = balanced, higher favors my gain. */
  alpha: number;
  /** A player of mine that every trade must include; must be on my roster or the search throws. */
  mustInclude: string | null;
  /** Players of mine that no trade may include. */
  untouchable: string[];
  /** If set, a trade must raise my room score at this position. */
  targetPosition: Position | null;
  /** Drop a trade if a strictly smaller trade inside it scores within this FRACTION of it (0.05 = 5%). */
  fillerTolerance: number;
  /** Max trade groups shown per opponent. */
  perOpponentCap: number;
  /** Max trade groups returned overall. */
  limit: number;
}

export const DEFAULT_SETTINGS: EngineSettings = {
  k: 0.02,
  creator: null,
  depthWeights: [0.25, 0.1],
  maxPerSide: 3,
  minGainPct: 0.01,
  alpha: 0.5,
  mustInclude: null,
  untouchable: [],
  targetPosition: null,
  fillerTolerance: 0.05,
  perOpponentCap: 3,
  limit: 25,
};
