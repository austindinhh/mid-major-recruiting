import { useEffect, useState, type ReactNode } from "react";
import { InfoButton } from "../components/InfoButton";
import { Link } from "react-router-dom";
import { CompScatter, MovingUp, RoleOutcomes } from "../components/MethodCharts";
import { loadMethodology } from "../data/load";
import type { MethodologyFile } from "../data/types";
import { num, seasonLabel } from "../lib/format";
import { ROLES } from "../lib/roles";
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

  useEffect(() => {
    document.title = "How the Model Works · Scouting Board";
    loadMethodology().then(setData, (e: Error) => setError(e.message));
    return () => { document.title = "Scouting Board"; };
  }, []);

  if (error) return <><h1 className={styles.title}>How the Model Works</h1><p role="alert">{error}</p></>;
  if (!data) return <div aria-busy="true"><div className="skeleton" style={{ height: 600 }} /></div>;

  const label = new Map(data.features.map((f) => [f.key, f.label]));
  const starterRow = data.roles.find((r) => r.role === 3);
  const starter = starterRow && starterRow.shares[3] + starterRow.shares[4];


  return (
    <>
      <h1 className={styles.title}>How the Model Works</h1>
      <p className={styles.lede}>
        Every player on the board gets one number: the PRPG (points a game he adds over a replacement-level player) he
        would be expected to produce at a Big Ten school.
        Here is where that number comes from and how much to lean on it.
      </p>

      <dl className={styles.strip}>
        <div><dt>Transfers studied</dt><dd>{approx(data.transfers)}</dd></div>
        <div><dt>Seasons of data</dt><dd>Since {seasonLabel(data.first_season)}</dd></div>
        <div><dt>Stats per player</dt><dd>{data.features.length}</dd></div>
        <div><dt>Typical miss</dt><dd>±{num(data.typical_miss, 2)} PRPG</dd></div>
      </dl>

      <Section id="how" title="How Does It Work?" visual={<MovingUp rows={data.moving_up} />}>
        <p>
          Players who move up to a high-major usually produce less, because every night is a tougher opponent. The chart
          shows the typical change: a star at his old school usually becomes a starter, and a starter usually becomes a
          rotation player.
        </p>
        <p>
          That's only the average, and players spread widely around it. The model learned from every D1 transfer since{" "}
          {seasonLabel(data.first_season)} which players tend to hold their level and which tend to drop, using{" "}
          {data.features.length} stats from each player's season, then applies that to players who haven't moved yet.
        </p>
      </Section>

      <Section id="prpg" title="What Does the Number Mean?" visual={
        <figure className={styles.scale} aria-label="PRPG scale: below 0 is below replacement, 0 to 1 end of bench, 1 to 2 rotation, 2 to 3 starter, 3 and up star">
          <div className={styles.scaleBar}>
            {ROLES.map((r, i) => (
              <div key={r.name} className={styles[`band${i}`]} style={{ flexGrow: 1 }}>
                <b>{r.name}</b>
                <span>{r.from < 0 ? "Below 0" : i === ROLES.length - 1 ? `${r.from} and up` : `${r.from} to ${r.to}`}</span>
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
        <div className={styles.accordion}>
          {GROUPS.map((g) => {
            const stats = g.keys.filter((k) => label.has(k)).map((k) => label.get(k));
            return (
              <details key={g.title}>
                <summary><b>{g.title}</b><span>{stats.length} stats</span></summary>
                <ul>{stats.map((s) => <li key={s}>{s}</li>)}</ul>
              </details>
            );
          })}
        </div>
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

      <Section id="accuracy" title="How Often Is It Right?" visual={<RoleOutcomes roles={data.roles} />}>
        <p>
          Each bar takes past players the model projected for one role and shows what they actually became, using the
          roles on the scale above.
        </p>
        {starter && (
          <p>
            When it projects a starter, about {Math.round(starter * 10)} in 10 end up starters or better. Read a projection as
            the most likely outcome; a good share of players land a role above or below it.
          </p>
        )}
      </Section>

      {data.comp_demo && (
        <Section id="comps" title="How Comps Are Picked" visual={
          <>
            <CompScatter demo={data.comp_demo} />
            <CompFormula comp={data.comp_features} />
          </>
        }>
          <p>
            For every player, the site looks back at everyone who moved up to a high-major and finds the three who looked
            most like him the season before they moved. Then you can see what those three did after the move.
          </p>
          <p>
            "Most like him" counts production the most, then height and position, then usage, efficiency, conference
            strength and recent improvement. The chart shows the idea with the two stats that count most: the closer two
            dots are, the more alike the players.
          </p>
          <p>
            {data.comp_demo.player}'s comps aren't the closest dots here because the other stats count too.
          </p>
        </Section>
      )}

      <Section id="zones" title="How Shot Zones Are Colored" visual={<ZoneRule />}>
        <p>
          The court on each player page compares his FG% at the rim, from midrange and from three with the D1 average for
          players at his position that season.
        </p>
        <p>
          Even an exactly average shooter won't hit the average on a small number of shots. On 25 midrange shots, luck
          alone moves his FG% by about 10 points; on 200 shots, by about 3.5.
        </p>
        <p>
          So a zone turns blue or orange only when his gap is bigger than that luck range for his number of shots. Smaller
          gaps stay grey, and the court still prints the exact gap.
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
        {approx(data.player_seasons)} player seasons since <span className={styles.nowrap}>{seasonLabel(data.first_season)}</span>.{" "}
        <Link to="/">Back to the board</Link>
      </p>
    </>
  );
}

function CompFormula({ comp }: { comp: MethodologyFile["comp_features"] }) {
  const sorted = [...comp].sort((a, b) => b.weight - a.weight);
  const w = (v: number) => num(v, v % 1 ? 1 : 0);
  return (
    <figure className={styles.formula} aria-label={`Comps are the past transfers with the lowest difference score. Difference score equals the square root of the sum of each weight times the squared gap: ${sorted.map((f) => `${w(f.weight)} times ${f.label}`).join(", ")}.`}>
      <figcaption className={styles.formulaHead}>
        How a match is scored
        <InfoButton label="how a match is scored">
          <p className="def-p">
            Squaring each gap and taking the square root is the ordinary straight-line distance between two dots on the
            chart, extended from 2 stats to {comp.length}. It also makes one big gap count for more than a few small ones.
          </p>
          <p className="def-p">Each stat is scaled from 0 to 1 first, so no stat counts more just because its numbers are bigger.</p>
        </InfoButton>
      </figcaption>
      <div className={styles.math} aria-hidden="true">
        <span className={styles.lhs}>Comps =</span>
        <span>past transfers with the lowest Difference score</span>
      </div>
      <div className={styles.math} aria-hidden="true">
        <span className={styles.lhs}>Difference score =</span>
        <Root>
          <ol>
            {sorted.map((f, i) => (
              <li key={f.label}>
                <span className={styles.op}>{i ? "+" : ""}</span>
                <span className={styles.w}>{w(f.weight)} ×</span>
                <span className={styles.nowrap}>({f.label} gap)²</span>
              </li>
            ))}
          </ol>
        </Root>
      </div>
    </figure>
  );
}

function ZoneRule() {
  return (
    <figure className={styles.formula} aria-label="Zone gap equals his FG% minus the D1 average FG% for his position. Luck range equals the square root of the average times one minus the average, divided by his shots in the zone. The zone is better when the gap is at least one luck range above, worse when at least one luck range below, and too close to call otherwise.">
      <figcaption>How a zone is colored</figcaption>
      <div className={styles.math} aria-hidden="true">
        <span className={styles.lhs}>Gap =</span>
        <span>his FG% − average FG%</span>
      </div>
      <div className={styles.math} aria-hidden="true">
        <span className={styles.lhs}>Luck range =</span>
        <Root>
          <span className={styles.fraction}>
            <span>average × (1 − average)</span>
            <span>his shots from the zone</span>
          </span>
        </Root>
      </div>
      <ul className={styles.zoneRules}>
        <li><i style={{ background: "var(--zone-better)" }} />Gap at least one luck range above: better</li>
        <li><i style={{ background: "var(--zone-near)" }} />Gap inside the luck range: too close to call</li>
        <li><i style={{ background: "var(--zone-worse)" }} />Gap at least one luck range below: worse</li>
      </ul>
    </figure>
  );
}

// A drawn square root: the check mark stretches to the height of what it covers, and the bar runs over it.
function Root({ children }: { children: ReactNode }) {
  return (
    <span className={styles.root}>
      <svg className={styles.radical} viewBox="0 0 20 100" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 62 L5 56 L11 100 L20 0" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className={styles.radicand}>{children}</span>
    </span>
  );
}
