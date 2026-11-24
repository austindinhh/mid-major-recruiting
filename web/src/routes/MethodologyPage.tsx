import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Mermaid } from "../components/Mermaid";
import { loadMethodology } from "../data/load";
import type { MethodologyFile } from "../data/types";
import { num, seasonLabel } from "../lib/format";
import { useMediaQuery } from "../lib/useMediaQuery";
import styles from "./MethodologyPage.module.css";

// The model's inputs, grouped the way a scout would think about them. Labels come from the export.
const GROUPS: { title: string; keys: string[] }[] = [
  { title: "Production", keys: ["porpag", "dporpag", "obpm", "dbpm", "porpag_trend"] },
  { title: "Shooting", keys: ["ts", "efg", "three_pa_rate", "ft_pct", "ftr", "ortg"] },
  { title: "Role", keys: ["usg", "min", "mpg", "g", "ast", "to"] },
  { title: "Rebounding and defense", keys: ["oreb_rate", "dreb_rate", "blk", "stl"] },
  { title: "Profile", keys: ["exp_num", "inches", "pos_num", "rec"] },
  { title: "Team and competition", keys: ["team_barthag", "team_adj_o", "team_adj_d", "origin_level", "destination_level"] },
];

// PRPG bands, light to dark navy.
const BANDS: { from: number; to: number; role: string }[] = [
  { from: -1, to: 0, role: "Below replacement" },
  { from: 0, to: 1, role: "End of bench" },
  { from: 1, to: 2, role: "Rotation" },
  { from: 2, to: 3, role: "Starter" },
  { from: 3, to: 5, role: "Star" },
];

const LIMITS: [string, string][] = [
  ["Freshmen", "A player in his first season has no college stats to project from."],
  ["Redshirt years", "They aren't in the data, so he may have more eligibility left than his record shows."],
  ["The biggest jumps", "Few low-major players have moved straight to the Big Ten, so those projections are the least certain."],
  ["Fit", "Health, coaching, system and the role he'd have on your roster aren't in the numbers."],
];

// Counts read better rounded down to a clean figure: 8,449 is "8,000+", 1,217 is "1,200+".
function approx(n: number): string {
  const step = n >= 5000 ? 1000 : n >= 1000 ? 100 : 10;
  return `${(Math.floor(n / step) * step).toLocaleString()}+`;
}
const pct = (v: number) => `${Math.round(v * 100)}%`;
// Mermaid labels are HTML; keep team names from breaking them.
const esc = (s: string) => s.replace(/[<>&"]/g, "");

function Section({ id, title, children, visual }: { id: string; title: string; children: ReactNode; visual?: ReactNode }) {
  return (
    <section aria-labelledby={id} className={styles.section}>
      <h2 id={id}>{title}</h2>
      <div className={visual ? styles.split : undefined}>
        <div className={styles.prose}>{children}</div>
        {visual && <div className={styles.visual}>{visual}</div>}
      </div>
    </section>
  );
}

export function MethodologyPage() {
  const [data, setData] = useState<MethodologyFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const narrow = useMediaQuery("(max-width: 700px)");

  useEffect(() => {
    document.title = "How the Model Works · Scouting Board";
    loadMethodology().then(setData, (e: Error) => setError(e.message));
    return () => { document.title = "Scouting Board"; };
  }, []);

  if (error) return <><h1 className={styles.title}>How the Model Works</h1><p role="alert">{error}</p></>;
  if (!data) return <div aria-busy="true"><div className="skeleton" style={{ height: 600 }} /></div>;

  const { models, out_of_fold: oof, example: ex } = data;
  const label = new Map(data.features.map((f) => [f.key, f.label]));
  const dir = narrow ? "TB" : "LR";
  const ppg = data.box.ppg;
  const one = oof.thresholds.find((t) => t.within === 1);

  const howChart = `flowchart ${dir}
  subgraph past["${approx(data.transfers)} past transfers"]
    direction ${dir}
    before["<b>Season before the move</b><br/>${data.features.length} stats at his old school"]
    after["<b>Season after</b><br/>his PRPG at the new school"]
    before -->|same player| after
  end
  model["<b>The model</b><br/>learns how much production<br/>changes with the jump"]
  now["<b>Player on the board</b><br/>his latest season"]
  proj["<b>Projected PRPG</b><br/>at a Big Ten school"]
  past --> model
  now --> model
  model --> proj
  class proj strong`;

  const exampleChart = ex && `flowchart ${dir}
  a["<b>${esc(ex.from_team)}, ${seasonLabel(ex.season)}</b><br/>${num(ex.before, 2)} PRPG"]
  p["<b>Projected at a Big Ten school</b><br/>${num(ex.projected, 2)} PRPG"]
  r["<b>${esc(ex.to_team)}, ${seasonLabel(ex.dest_season)}</b><br/>${num(ex.actual, 2)} PRPG"]
  a -->|model's projection, made before he played| p
  p -->|his real season: off by ${num(Math.abs(ex.actual - ex.projected), 2)}| r
  class p strong`;

  return (
    <>
      <h1 className={styles.title}>How the Model Works</h1>
      <p className={styles.lede}>
        Every player on the board gets one number: the PRPG he would be expected to produce at a Big Ten school.
        Here is where that number comes from and how much to lean on it.
      </p>

      <dl className={styles.strip}>
        <div><dt>Transfers studied</dt><dd>{approx(data.transfers)}</dd></div>
        <div><dt>Seasons of data</dt><dd>Since {seasonLabel(data.first_season)}</dd></div>
        <div><dt>Stats per player</dt><dd>{data.features.length}</dd></div>
        <div><dt>Typical miss</dt><dd>±{num(models.lgbm.mae, 2)} PRPG</dd></div>
      </dl>

      <Section id="how" title="How Does It Work?" visual={
        <Mermaid chart={howChart} label="Past transfers, each a season before and a season after the move, teach the model how production changes. A player on the board goes in, and his projected PRPG at a Big Ten school comes out." />
      }>
        <p>
          A player's stats depend on who he plays against, so numbers from a weaker conference can't be read the same
          way as Big Ten numbers, and no flat discount converts one into the other.
        </p>
        <p>
          Transfers show what actually happens. A player who moves up is the same person, so most of the change in his
          numbers comes from the jump in competition. The model studies {approx(data.transfers)} of those moves, up, down
          and sideways, and applies what it learned to players who haven't moved yet.
        </p>
      </Section>

      {ex && exampleChart && (
        <Section id="example" title="One Real Example" visual={
          <Mermaid chart={exampleChart} label={`${ex.player}: ${num(ex.before, 2)} PRPG at ${ex.from_team}, projected ${num(ex.projected, 2)} at a Big Ten school, ${num(ex.actual, 2)} at ${ex.to_team}.`} />
        }>
          <p>
            {ex.player} produced {num(ex.before, 2)} PRPG at {ex.from_team} in {seasonLabel(ex.season)}. Before he played a game
            at {ex.to_team}, the model projected {num(ex.projected, 2)} at a Big Ten school, about {num(ex.before - ex.projected, 1)} lower
            because he'd face stronger teams.
          </p>
          <p>
            He finished {seasonLabel(ex.dest_season)} at {num(ex.actual, 2)}. The model hadn't seen that season when it made
            the projection.
          </p>
        </Section>
      )}

      <Section id="prpg" title="What Does the Number Mean?" visual={
        <figure className={styles.scale} aria-label="PRPG scale: below 0 is below replacement, 0 to 1 end of bench, 1 to 2 rotation, 2 to 3 starter, 3 and up star">
          <div className={styles.scaleBar}>
            {BANDS.map((b, i) => (
              <div key={b.role} className={styles[`band${i}`]} style={{ flexGrow: b.to - b.from }}>
                <b>{b.role}</b>
                <span>{b.from < 0 ? "Below 0" : b.to === 5 ? `${b.from} and up` : `${b.from} to ${b.to}`}</span>
              </div>
            ))}
          </div>
        </figure>
      }>
        <p>
          PRPG is BartTorvik's points over replacement per game: how many points a game a player adds on offense over a
          replacement-level player. Def PRPG is the same idea on defense.
        </p>
        <p>
          Projected PRPG is the model's estimate for his first season at a team in an average high-major conference, which
          the site calls a Big Ten school. Separate models project his points, rebounds, assists, steals and blocks the
          same way.
        </p>
      </Section>

      <Section id="inputs" title="What Goes Into It?" visual={
        <dl className={styles.groups}>
          {GROUPS.map((g) => (
            <div key={g.title}>
              <dt>{g.title}</dt>
              <dd>{g.keys.filter((k) => label.has(k)).map((k) => label.get(k)).join(", ")}</dd>
            </div>
          ))}
        </dl>
      }>
        <p>
          {data.features.length} stats from his latest season, from scoring and shooting to his height, class year and how
          strong his team and conference were.
        </p>
        <p>
          Each player page has a "Why the Model Projects This" section that shows which of these pushed his projection up
          or down, and by how much.
        </p>
      </Section>

      <Section id="accuracy" title="How Often Is It Right?" visual={<Accuracy thresholds={oof.thresholds} />}>
        <p>
          To test it fairly, the model was trained {data.cv_folds} times, each time with a fifth of the players held out,
          and then projected the players it hadn't seen. The chart compares those projections with the simplest guess:
          that a player's PRPG stays the same after he moves.
        </p>
        {one && (
          <p>
            The model lands within 1 PRPG of what the player actually did {pct(one.model)} of the time, against{" "}
            {pct(one.flat)} for assuming no change. On average it misses by {num(models.lgbm.mae, 2)} PRPG, about one step
            on the scale above. Projected points per game miss by about {num(ppg.lgbm_mae, 1)} a game.
          </p>
        )}
      </Section>

      <Section id="comps" title="Comps and Shot Zones" visual={<Formulas comp={data.comp_features} />}>
        <p>
          "Similar Historical Transfers" on each player page are the three past players who moved up to a high-major and
          looked most like him the season before. The formula on the right scores how different two players are; the
          three smallest scores are his comps.
        </p>
        <p>
          "Shot Zones" compares his FG% in each zone with the D1 average for his position that season.
        </p>
      </Section>

      <section aria-labelledby="limits" className={styles.section}>
        <h2 id="limits">What It Can't Tell You</h2>
        <dl className={styles.limits}>
          {LIMITS.map(([t, d]) => <div key={t}><dt>{t}</dt><dd>{d}</dd></div>)}
          <div><dt>Early-season numbers</dt><dd>A player needs {data.min_games} games in a season to reach the board.</dd></div>
        </dl>
      </section>

      <p className={styles.source}>
        Stats from <a href="https://barttorvik.com">BartTorvik</a>, through
        the <a href="https://github.com/andreweatherman/toRvik-data">toRvik-data</a> archive and BartTorvik's own site:{" "}
        {approx(data.player_seasons)} player seasons since {seasonLabel(data.first_season)}.{" "}
        <Link to="/">Back to the board</Link>
      </p>
    </>
  );
}

function Accuracy({ thresholds }: { thresholds: MethodologyFile["out_of_fold"]["thresholds"] }) {
  return (
    <figure className={styles.accuracy} aria-label={`Share of past transfers projected close to what the player did. ${thresholds.map((t) => `Within ${t.within} PRPG: model ${pct(t.model)}, no change ${pct(t.flat)}`).join(". ")}.`}>
      <figcaption>Share of past transfers where the guess landed close to what the player did</figcaption>
      <p className={styles.legend} aria-hidden="true">
        <span><i className={styles.barStrong} />The model</span>
        <span><i className={styles.barMuted} />Assume his PRPG stays the same</span>
      </p>
      {thresholds.map((t) => (
        <div key={t.within} className={styles.group} aria-hidden="true">
          <span className={styles.groupLabel}>Within {num(t.within, t.within % 1 ? 1 : 0)} PRPG</span>
          <div className={styles.barRow}><i className={styles.barStrong} style={{ width: `calc(${pct(t.model)} - 3rem)` }} /><b>{pct(t.model)}</b></div>
          <div className={styles.barRow}><i className={styles.barMuted} style={{ width: `calc(${pct(t.flat)} - 3rem)` }} /><b>{pct(t.flat)}</b></div>
        </div>
      ))}
    </figure>
  );
}

function Formulas({ comp }: { comp: MethodologyFile["comp_features"] }) {
  const sorted = [...comp].sort((a, b) => b.weight - a.weight);
  return (
    <div className={styles.formulas}>
      <figure className={styles.formula} aria-label={`Difference squared equals the sum of each stat's weight times the squared gap: ${sorted.map((f) => `${num(f.weight, f.weight % 1 ? 1 : 0)} times ${f.label}`).join(", ")}.`}>
        <figcaption>How different is a past transfer from him?</figcaption>
        <div className={styles.math} aria-hidden="true">
          <span className={styles.lhs}>Difference² =</span>
          <ol>
            {sorted.map((f, i) => (
              <li key={f.label}>
                <span className={styles.op}>{i ? "+" : ""}</span>
                <span className={styles.w}>{num(f.weight, f.weight % 1 ? 1 : 0)} ×</span>
                <span>({f.label} gap)²</span>
              </li>
            ))}
          </ol>
        </div>
        <p className={styles.fnote}>Each gap is between him and the past player, with every stat first scaled from 0 to 1 across all past transfers.</p>
      </figure>
      <figure className={styles.formula} aria-label="Zone gap equals his FG% minus the D1 average FG% for his position. 2 or more points above is better, within 2 is average, 2 or more below is worse.">
        <figcaption>Shot zone color</figcaption>
        <div className={styles.math} aria-hidden="true">
          <span className={styles.lhs}>Zone gap =</span>
          <span>his FG% − D1 average FG% for his position</span>
        </div>
        <ul className={styles.zoneRules}>
          <li><i style={{ background: "var(--zone-better)" }} />2 or more points above: better</li>
          <li><i style={{ background: "var(--zone-near)" }} />Within 2 points: near average</li>
          <li><i style={{ background: "var(--zone-worse)" }} />2 or more points below: worse</li>
        </ul>
      </figure>
    </div>
  );
}
