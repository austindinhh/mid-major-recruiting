import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useApp } from "../appContext";
import { CareerLog } from "../components/CareerLog";
import { Court, CourtKey, ShotMix } from "../components/Court";
import { DriverBars } from "../components/DriverBars";
import { DefButton, InfoButton, SectionHead } from "../components/InfoButton";
import { loadPlayer, loadZoneAverages } from "../data/load";
import type { PlayerFile, ZoneAverages } from "../data/types";
import { confName } from "../lib/conferences";
import { className, height, num, ordinal, pctShown, seasonLabel, signed } from "../lib/format";
import { heatStyle } from "../lib/heat";
import { STATS } from "../lib/stats";
import { useDarkMode } from "../lib/useDarkMode";
import { MIN_MPG } from "../lib/volume";
import styles from "./PlayerPage.module.css";

const STRIP = ["porpag", "dporpag", "ppg", "ts", "ast", "to", "stl", "blk"].map((k) => STATS[k]);
// Rate stats from a few minutes a game make extreme percentiles that mean little, so their chips are hidden.
const RATE_STATS = new Set(["ts", "ast", "to", "stl", "blk"]);
const BOX: { key: string; label: string }[] = [
  { key: "ppg", label: "Points" }, { key: "rpg", label: "Rebounds" }, { key: "apg", label: "Assists" },
  { key: "spg", label: "Steals" }, { key: "bpg", label: "Blocks" },
];

// Differences are taken from the rounded values on screen, so the printed numbers add up.
const round = (v: number, digits: number) => Number(v.toFixed(digits));

interface Loaded { key: string; player?: PlayerFile; averages?: ZoneAverages; error?: string }

export function PlayerPage() {
  const { seasons, season, error: seasonsError } = useApp();
  const id = Number(useParams().id);
  const location = useLocation();
  const dark = useDarkMode();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [attempt, setAttempt] = useState(0);
  const key = `${season}/${id}/${attempt}`;
  const current = loaded?.key === key ? loaded : null;
  const player = current?.player ?? null;
  const entry = seasons?.seasons.find((s) => s.season === season);
  // Coming from the board, go back to the same filters; a shared link goes to the season's board.
  const back = (location.state as { back?: string } | null)?.back ?? `/?season=${season ?? ""}`;

  useEffect(() => {
    if (season == null || !id) return;
    let live = true;
    Promise.all([loadPlayer(season, id), loadZoneAverages(season)]).then(
      ([p, a]) => { if (live) setLoaded({ key, player: p, averages: a }); },
      (e: Error) => { if (live) setLoaded({ key, error: e.message.includes("404") ? "missing" : e.message }); },
    );
    return () => { live = false; };
  }, [season, id, key]);

  useEffect(() => {
    document.title = player ? `${player.bio.player} · Scouting Board` : "Scouting Board";
    return () => { document.title = "Scouting Board"; };
  }, [player]);

  const backLink = <Link className={styles.back} to={back}>Back to the board</Link>;

  if (seasonsError || current?.error) {
    return (
      <>
        {backLink}
        <div className={styles.error} role="alert">
          <p>{seasonsError ?? (current?.error === "missing"
            ? `No player with ID ${id} is on the ${entry?.label ?? ""} board. He may have played under ${seasons?.min_games ?? 10} games or at a high-major that season, or the link may be wrong.`
            : current?.error)}</p>
          {current?.error && current.error !== "missing" && <button type="button" onClick={() => setAttempt((a) => a + 1)}>Try again</button>}
        </div>
      </>
    );
  }
  if (!player || season == null) return <>{backLink}<PlayerSkeleton /></>;

  const { bio, projection, percentiles, stats, zones, prediction_vs_reality: pvr } = player;
  const averages = current?.averages;
  const zoneAvg = averages?.[bio.pos ?? ""] ?? averages?.all ?? null;
  const posLabel = bio.pos ? `${bio.pos}s` : "players at his position";
  const lowMinutes = stats.mpg != null && stats.mpg < MIN_MPG;
  const zonesSection = (
            <section aria-labelledby="zones">
              <SectionHead id="zones" title="Shot Zones">
                <p className="def-p">The bar shows where his shots come from. The court shows his FG% from each zone against the D1 average for {posLabel} this season, in percentage points. Blue means 2 or more points better than that average, orange 2 or more worse, grey within 2, and the bar uses the same colors.</p>
              </SectionHead>
              {zones ? (
                <>
                  <ShotMix zones={zones} averages={zoneAvg} />
                  <Court zones={zones} averages={zoneAvg} title={`Shot zones for ${bio.player}`} />
                  <CourtKey group={posLabel} />
                </>
              ) : <p className={styles.empty}>No shot-zone data for this season.</p>}
            </section>
  );

  return (
    <>
      {backLink}
      <section className={styles.plate} aria-label="Player summary">
        <div className={styles.name}>
          <h1>{bio.player}</h1>
          <dl className={styles.facts}>
            <div><dt>Position</dt><dd>{bio.pos ?? "–"}</dd></div>
            <div><dt>Height</dt><dd>{height(bio.inches)}</dd></div>
            <div><dt>Class</dt><dd>{className(bio.exp)}</dd></div>
            <div><dt>Games</dt><dd>{bio.g}</dd></div>
            <div><dt>Minutes</dt><dd>{num(stats.mpg, 1)}</dd></div>
          </dl>
        </div>
        <div className={styles.team}>
          <span className={styles.teamName}>{bio.team}</span>
          <span className={styles.conf}>{confName(bio.conf)}</span>
        </div>
        <div className={styles.proj}>
          <span className={styles.projValue}>{num(projection.projected_porpag, 2)}</span>
          <span className={styles.projLabel}>Projected PRPG at a Big Ten school</span>
          <span>Ranked {player.rank.toLocaleString()}/{entry?.players.toLocaleString() ?? "–"} on the board</span>
        </div>
      </section>

      <div className={styles.stripWrap}>
        <dl className={styles.strip}>
          {STRIP.map((s) => {
            const hidden = lowMinutes && RATE_STATS.has(s.key);
            const raw = hidden ? null : s.key === "porpag" ? projection.porpag : s.key === "dporpag" ? projection.dporpag : stats[s.key];
            const p = hidden ? null : pctShown(percentiles[s.key]);
            return (
              <div key={s.key}>
                <dt><DefButton label={s.label}><p className="def-p">{s.help}</p></DefButton></dt>
                <dd className={styles.value}>{num(raw, s.digits)}</dd>
                {p != null && (
                  <dd className={styles.chip} style={heatStyle(p, dark)}>
                    {ordinal(p)}<span className="visually-hidden"> percentile among {posLabel}</span>
                  </dd>
                )}
              </div>
            );
          })}
        </dl>
        <InfoButton label="the percentiles" className={styles.stripInfo}>
          <p className="def-p">Each chip is his percentile among {posLabel} on this season's board. Blue is better than the 50th, orange is worse.</p>
          {lowMinutes && <p className="def-p">He plays under {MIN_MPG} minutes a game, so his rate stats (TS%, AST%, TO%, STL%, BLK%) are left blank.</p>}
        </InfoButton>
      </div>

      {/* Coach-language answers first (projected line, comps), then the model's reasons and his game, then history. */}
      <div className={styles.sections}>
        <section aria-labelledby="box">
          <SectionHead id="box" title="Projected Box Stats">
            <p className="def-p">Per-game stats this season next to what separate models project at a Big Ten school.</p>
          </SectionHead>
          <table className={styles.table}>
            <thead><tr><th scope="col">Per game</th><th scope="col">Current</th><th scope="col">Projected</th><th scope="col">Change</th></tr></thead>
            <tbody>
              {BOX.map((b) => {
                const v = player.box[b.key];
                const change = v?.current != null && v?.projected != null ? round(v.projected, 1) - round(v.current, 1) : null;
                return (
                  <tr key={b.key}>
                    <th scope="row">{b.label}</th>
                    <td>{num(v?.current, 1)}</td>
                    <td className={styles.strong}>{num(v?.projected, 1)}</td>
                    <td>{signed(change, 1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section aria-labelledby="comps">
          <SectionHead id="comps" title="Similar Historical Transfers">
            <p className="def-p">The three past transfers to a high-major whose stats before the move were closest to his. Select a name to open his page for the season before he moved.</p>
            <p className="def-p">Before is his PRPG in that season and Actual is his PRPG after the move. Projected is what the model predicted for the move without seeing its result. Those predictions start with 2019-20 transfers, so earlier moves show a dash.</p>
          </SectionHead>
          {player.comps.length ? (
            <table className={styles.table}>
              <thead><tr><th scope="col">Player</th><th scope="col">Before</th><th scope="col">Projected</th><th scope="col">Actual</th></tr></thead>
              <tbody>
                {player.comps.map((c) => (
                  <tr key={`${c.player}-${c.dest_season}`}>
                    <th scope="row">
                      {c.link
                        ? <Link className={styles.compName} to={`/player/${c.link.id}?season=${c.link.season}`}>{c.player}</Link>
                        : <span className={styles.compName}>{c.player}</span>}
                      <span className={styles.move}>{c.from_team} to {c.to_team}, {c.season_label}</span>
                    </th>
                    <td>{num(c.before_porpag, 2)}</td>
                    <td className={c.projected_porpag == null ? styles.mutedCell : undefined}>{num(c.projected_porpag, 2)}</td>
                    <td className={styles.strong}>{num(c.actual_porpag, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className={styles.empty}>No close comparisons among past transfers.</p>}
        </section>

        <section aria-labelledby="why">
          <SectionHead id="why" title="Why the Model Projects This">
            <p className="def-p">Each bar is how much one factor moves his projected PRPG up or down, in PRPG points. The bars are the ten largest after his current PRPG, which has its own row above them.</p>
            <p className="def-p">Read it top to bottom: the model starts from the average transfer, adds his current PRPG and every other factor, and lands on his projection.</p>
          </SectionHead>
          <DriverBars player={player} />
        </section>

        {zonesSection}

        {/* Career is wide; Prediction vs. Reality is three numbers, so it takes the narrow column beside it. */}
        {player.career.length > 1 && (
          <div className={pvr ? styles.wideNarrow : styles.full}>
            <section aria-labelledby="career">
            <SectionHead id="career" title="Career">
              <p className="def-p">Every college season on record, oldest first, with this season shaded. A divider marks each transfer, and a season with no D1 games gets its own row. +/− is the change in PRPG from his previous season.</p>
            </SectionHead>
            <CareerLog career={player.career} current={season} />
          </section>
            {pvr && (
              <section aria-labelledby="pvr">
            <SectionHead id="pvr" title="Prediction vs. Reality">
              <p className="def-p">His most recent transfer: what the model predicted for that move without seeing its result, and what he did. Difference is actual minus predicted.</p>
            </SectionHead>
            <p className={styles.pvrMove}>{pvr.from_team} ({confName(pvr.from_conf)}) to {pvr.to_team} ({confName(pvr.to_conf)}), {seasonLabel(pvr.dest_season)}</p>
            <dl className={styles.pvr}>
              <div><dt>Predicted PRPG</dt><dd>{num(pvr.projected_porpag, 2)}</dd></div>
              <div><dt>Actual PRPG</dt><dd>{num(pvr.actual_porpag, 2)}</dd></div>
              <div className={styles.pvrDiff}><dt>Difference</dt><dd>{signed(round(pvr.actual_porpag, 2) - round(pvr.projected_porpag, 2))}</dd></div>
            </dl>
          </section>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function PlayerSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading player">
      <div className="skeleton" style={{ height: 152 }} />
      <div className="skeleton" style={{ height: 88, marginTop: 4 }} />
      <div className={styles.sections}>
        {[0, 1].map((i) => <div key={i} className="skeleton" style={{ height: 320 }} />)}
      </div>
    </div>
  );
}
