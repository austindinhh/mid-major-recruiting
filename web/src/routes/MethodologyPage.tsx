import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { loadMethodology } from "../data/load";
import type { MethodologyFile } from "../data/types";
import { num, seasonLabel } from "../lib/format";
import styles from "./MethodologyPage.module.css";

// The model's 30 inputs, grouped the way a scout would think about them. Labels come from the export.
const GROUPS: { title: string; keys: string[] }[] = [
  { title: "Production", keys: ["porpag", "dporpag", "obpm", "dbpm", "porpag_trend"] },
  { title: "Shooting", keys: ["ts", "efg", "three_pa_rate", "ft_pct", "ftr", "ortg"] },
  { title: "Role", keys: ["usg", "min", "mpg", "g", "ast", "to"] },
  { title: "Rebounding and defense", keys: ["oreb_rate", "dreb_rate", "blk", "stl"] },
  { title: "Profile", keys: ["exp_num", "inches", "pos_num", "rec"] },
  { title: "Team and competition", keys: ["team_barthag", "team_adj_o", "team_adj_d", "origin_level", "destination_level"] },
];

const BOX_NAMES: Record<string, string> = { ppg: "Points", rpg: "Rebounds", apg: "Assists", spg: "Steals", bpg: "Blocks" };

const PRPG_SCALE: [string, string][] = [
  ["Below 0", "Below replacement level"],
  ["0 to 1", "End of the bench"],
  ["1 to 2", "Rotation player"],
  ["2 to 3", "Starter"],
  ["3 and up", "Star"],
];

const pct = (v: number) => `${Math.round(v * 100)}%`;
const pct1 = (v: number) => `${(v * 100).toFixed(1)}%`;
const count = (v: number) => v.toLocaleString();
const weightName = (w: number) => (w === 1 ? "Count once" : w === 2 ? "Count double" : `Count ${w} times`);

export function MethodologyPage() {
  const [data, setData] = useState<MethodologyFile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "How the Model Works · Scouting Board";
    loadMethodology().then(setData, (e: Error) => setError(e.message));
    return () => { document.title = "Scouting Board"; };
  }, []);

  if (error) return <div className={styles.page}><h1>How the Model Works</h1><p role="alert">{error}</p></div>;
  if (!data) return <div className={styles.page} aria-busy="true"><div className="skeleton" style={{ height: 600 }} /></div>;

  const { models, out_of_fold: oof } = data;
  const cut = 1 - models.lgbm.mae / models.naive.mae;
  const label = new Map(data.features.map((f) => [f.key, f.label]));
  const byWeight = (w: number) => data.comp_features.filter((f) => f.weight === w).map((f) => f.label);
  const weights = [...new Set(data.comp_features.map((f) => f.weight))].sort((a, b) => b - a);

  return (
    <article className={styles.page}>
      <h1>How the Model Works</h1>
      <p className={styles.lede}>
        The board ranks every D1 player outside the high-majors by one number: the PRPG he would be expected to
        produce at a Big Ten school. This page covers where that number comes from and how far to trust it.
      </p>

      <section aria-labelledby="experiment">
        <h2 id="experiment">Transfers Are the Experiment</h2>
        <p>
          Stats from a mid-major and stats from the Big Ten can't be compared directly, because the competition is
          different. Transfers get around that: when a player moves, the same person is measured at two competition
          levels, one season apart.
        </p>
        <p>
          The model learns from {count(data.transfers)} transfers between D1 programs, with destination seasons from{" "}
          {seasonLabel(data.first_season + 1)} through {seasonLabel(data.last_season)}. That includes sideways and downward moves,
          not only the {count(data.transfers_up_to_high_major)} moves from outside the high-majors into one, so it learns
          how production changes across every size of jump.
        </p>
      </section>

      <section aria-labelledby="predicts">
        <h2 id="predicts">What It Predicts</h2>
        <p>
          PRPG is BartTorvik's points over replacement per game: how many points a game a player adds on offense compared
          with a replacement-level player. Def PRPG is the defensive version. As a rough guide:
        </p>
        <table className={`${styles.table} ${styles.text}`}>
          <thead><tr><th scope="col">PRPG</th><th scope="col">Typical role</th></tr></thead>
          <tbody>{PRPG_SCALE.map(([range, role]) => <tr key={range}><th scope="row">{range}</th><td>{role}</td></tr>)}</tbody>
        </table>
        <p>
          Projected PRPG is the model's estimate of his PRPG in the season after a move to a team at the average
          high-major competition level (what the site calls a Big Ten school). Separate models project his points,
          rebounds, assists, steals and blocks per game the same way.
        </p>
      </section>

      <section aria-labelledby="inputs">
        <h2 id="inputs">What It Looks At</h2>
        <p>
          {data.features.length} measures from his most recent season. On each player page, "Why the Model Projects
          This" shows which of them moved his projection and by how much.
        </p>
        <dl className={styles.groups}>
          {GROUPS.map((g) => (
            <div key={g.title}>
              <dt>{g.title}</dt>
              <dd>{g.keys.filter((k) => label.has(k)).map((k) => label.get(k)).join(", ")}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="accuracy">
        <h2 id="accuracy">How Accurate It Is</h2>
        <p>
          The model was tested {data.cv_folds} times, each time trained without a fifth of the players and scored on their
          transfers, which it had never seen. All of a player's transfers sit in the same fifth, so the model is never
          tested on a player it learned from.
        </p>
        <table className={styles.table}>
          <thead><tr><th scope="col">Method</th><th scope="col">Typical miss (PRPG)</th><th scope="col">vs. no change</th></tr></thead>
          <tbody>
            <tr><th scope="row">His PRPG stays the same</th><td>{num(models.naive.mae, 3)}</td><td /></tr>
            <tr><th scope="row">Ridge regression</th><td>{num(models.ridge.mae, 3)}</td><td>{pct1(1 - models.ridge.mae / models.naive.mae)} smaller</td></tr>
            <tr className={styles.used}><th scope="row">LightGBM (used on the board)</th><td>{num(models.lgbm.mae, 3)}</td><td>{pct1(cut)} smaller</td></tr>
          </tbody>
        </table>
        <p>
          The typical miss is the average gap between projected and actual PRPG. Assuming a player's PRPG carries over
          unchanged misses by {num(models.naive.mae, 2)}; the board's model cuts that by {pct1(cut)}. It edges out the
          simpler Ridge model by only {num(models.ridge.mae - models.lgbm.mae, 3)}, so nearly all of the gain comes from
          learning from transfers, and the choice between the two models matters little.
        </p>
        <p>
          A miss of {num(models.lgbm.mae, 2)} is a little under one step on the scale above, such as rotation player against starter. Across
          the {count(oof.n)} transfers since {seasonLabel(oof.first_dest_season)}, {pct(oof.within_one)} of projections
          landed within 1 PRPG of what the player went on to do, and {pct(oof.within_half)} within 0.5.
        </p>
        <table className={styles.table}>
          <thead><tr><th scope="col">Per game</th><th scope="col">Stays the same</th><th scope="col">Model</th></tr></thead>
          <tbody>
            {Object.entries(data.box).map(([stat, v]) => (
              <tr key={stat}><th scope="row">{BOX_NAMES[stat] ?? stat}</th><td>{num(v.naive_mae, 2)}</td><td>{num(v.lgbm_mae, 2)}</td></tr>
            ))}
          </tbody>
        </table>
        <p className={styles.note}>Typical miss for the projected box stats, scored the same way.</p>
      </section>

      <section aria-labelledby="comps">
        <h2 id="comps">Similar Transfers and Shot Zones</h2>
        <p>
          "Similar Historical Transfers" are the three past moves into a high-major made by players who looked most like
          him in the season before their move. Likeness is measured across {data.comp_features.length} stats, some weighted
          more than others:
        </p>
        <dl className={`${styles.groups} ${styles.stack}`}>
          {weights.map((w) => <div key={w}><dt>{weightName(w)}</dt><dd>{byWeight(w).join(", ")}</dd></div>)}
        </dl>
        <p>
          "Projected" for a past move is the model's prediction from the test above, made without that player's transfers
          in training. The site keeps those predictions for moves since {seasonLabel(oof.first_dest_season)}, so older
          comparisons show a dash.
        </p>
        <p>
          "Shot Zones" compares his FG% at the rim, from midrange and from three with the D1 average for his position that
          season. Within 2 percentage points counts as average.
        </p>
      </section>

      <section aria-labelledby="limits">
        <h2 id="limits">What It Can't See</h2>
        <ul className={styles.list}>
          <li>Freshmen in their first season have no college stats to project from.</li>
          <li>Redshirt years aren't in the data, so a player may have more eligibility left than his record suggests.</li>
          <li>The biggest jumps, from low-major to the Big Ten, have the fewest past examples, so those projections are the least certain.</li>
          <li>Fit, health, coaching and the role he'd have on a new roster aren't modeled.</li>
          <li>Players need {data.min_games} games in a season to make the board; early-season numbers are noisy.</li>
        </ul>
      </section>

      <section aria-labelledby="data">
        <h2 id="data">Data</h2>
        <p>
          Player and team stats come from <a href="https://barttorvik.com">BartTorvik</a>, through
          the <a href="https://github.com/andreweatherman/toRvik-data">toRvik-data</a> archive and BartTorvik's own site:{" "}
          {count(data.player_seasons)} player seasons from {count(data.players)} players, {seasonLabel(data.first_season)}{" "}
          through {seasonLabel(data.last_season)}, so the newest board ranks {seasonLabel(data.last_season)} players.
          These numbers were last exported on{" "}
          {new Date(`${data.generated}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.
        </p>
        <p><Link to="/">Back to the board</Link></p>
      </section>
    </article>
  );
}
