export type Tier = "Low-Major" | "Mid-Major" | "High-Major";

export interface SeasonEntry {
  season: number;
  label: string;
  players: number;
  tiers: Record<Tier, number>;
}

export interface SeasonsFile {
  generated: string;
  default_season: number;
  min_games: number;
  seasons: SeasonEntry[];
}

export const PCT_STATS = [
  "porpag", "dporpag", "projected_porpag", "ppg", "usg", "ortg", "ts",
  "ast", "to", "ftr", "stl", "blk", "oreb_rate", "dreb_rate",
] as const;
export type PctStat = (typeof PCT_STATS)[number];

export interface BoardRow {
  rank: number;
  id: number;
  player: string;
  pos: string | null;
  team: string;
  conf: string;
  exp: string | null;
  inches: number | null;
  g: number;
  mpg: number | null;
  fga: number | null;
  porpag: number;
  dporpag: number | null;
  projected_porpag: number;
  gem_score: number | null;
  usg: number | null;
  ortg: number | null;
  ts: number | null;
  ast: number | null;
  to: number | null;
  ftr: number | null;
  pct: Partial<Record<PctStat, number | null>>;
}

export interface Zone {
  share: number;
  pct: number | null;
  made: number;
  att: number;
}
export type ZoneKey = "rim" | "mid" | "three";

export interface ZoneAverage {
  pct: number | null;
  share: number | null;
}
export type ZoneAverages = Record<string, Record<ZoneKey, ZoneAverage>>;

export interface PlayerFile {
  id: number;
  season: number;
  rank: number;
  bio: {
    player: string;
    pos: string | null;
    team: string;
    conf: string;
    exp: string | null;
    inches: number | null;
    g: number;
    seasons_played: number | null;
  };
  projection: {
    projected_porpag: number;
    porpag: number;
    dporpag: number | null;
    gem_score: number | null;
    bias: number;
    porpag_contribution: number | null;
  };
  stats: Record<string, number | null>;
  percentiles: Partial<Record<PctStat, number | null>>;
  box: Record<string, { current: number | null; projected: number | null }>;
  drivers: { feature: string; label: string; value: number }[];
  zones: Record<ZoneKey, Zone> | null;
  career: {
    year: number;
    team: string;
    conf: string;
    g: number;
    mpg: number | null;
    ppg: number | null;
    porpag: number | null;
    dporpag: number | null;
    usg: number | null;
    ts: number | null;
    ast: number | null;
    season_label: string;
    tier: "high" | "mid" | "low";
  }[];
  comps: {
    player: string;
    from_team: string;
    from_conf: string;
    to_team: string;
    to_conf: string;
    dest_season: number;
    projected_porpag: number | null;
    actual_porpag: number;
    season_label: string;
  }[];
  prediction_vs_reality: {
    from_team: string;
    from_conf: string;
    to_team: string;
    to_conf: string;
    season: number;
    dest_season: number;
    projected_porpag: number;
    actual_porpag: number;
    error: number;
  } | null;
}
