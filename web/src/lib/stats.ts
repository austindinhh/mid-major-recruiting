import type { PctStat } from "../data/types";

export interface StatDef {
  key: PctStat;
  label: string;
  digits: number;
  help: string;
}

export const STATS: Record<string, StatDef> = {
  porpag: { key: "porpag", label: "PRPG", digits: 2, help: "Points over replacement per game, from BartTorvik: how many points a game he adds over a replacement-level player. Below 0 is below replacement, 1 to 2 is a solid contributor, 3 and up is a star." },
  dporpag: { key: "dporpag", label: "Def PRPG", digits: 2, help: "Defensive points over replacement per game." },
  ppg: { key: "ppg", label: "PPG", digits: 1, help: "Points per game." },
  usg: { key: "usg", label: "USG%", digits: 1, help: "Usage rate: the share of team possessions he uses while on the floor. About 20% is average." },
  ts: { key: "ts", label: "TS%", digits: 1, help: "True shooting percentage: scoring efficiency that counts threes and free throws." },
  ast: { key: "ast", label: "AST%", digits: 1, help: "Assist rate: the share of teammates' baskets he assists while on the floor." },
  to: { key: "to", label: "TO%", digits: 1, help: "Turnover rate: turnovers per 100 possessions he uses. Lower is better, so its percentile is flipped: a high percentile means few turnovers." },
  stl: { key: "stl", label: "STL%", digits: 1, help: "Steal rate: the share of opponent possessions that end in his steal while he is on the floor." },
  blk: { key: "blk", label: "BLK%", digits: 1, help: "Block rate: the share of opponent two-point attempts he blocks while on the floor." },
};
