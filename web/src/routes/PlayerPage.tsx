import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useApp } from "../appContext";
import { CareerChart } from "../components/CareerChart";
import { Court, ZoneLegend } from "../components/Court";
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
  // With no zone data the section is one line, so it goes last instead of leaving a hole beside the drivers.
  const zonesSection = (
            <section aria-labelledby="zones">
              <SectionHead id="zones" title="Shot Zones">
                <p className="def-p">Each zone shows his make rate, his share of shots and the D1 average make rate for {posLabel} this season. Zone color compares his make rate with that average.</p>
              </SectionHead>
              {zones ? (
                <>
                  <Court zones={zones} averages={zoneAvg} title={`Shot zones for ${bio.player}`} />
                  <ZoneLegend zones={zones} showShare={false} />
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
          <span className={styles.conf}>{confName(bio.conf)} · {seasonLabel(season)}</span>
        </div>
        <div className={styles.proj}>
          <span className={styles.projValue}>{num(projection.projected_porpag, 2)}</span>
          <span className={styles.projLabel}>Projected PRPG at a Big Ten school</span>
          <span>Ranked {player.rank.toLocaleString()} of {entry?.players.toLocaleString() ?? "–"} on the {entry?.label} board</span>
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

      <div className={styles.sections}>
        <section aria-labelledby="why">
          <SectionHead id="why" title="Why the Model Projects This">
            <p className="def-p">Each bar is how much one factor moves his projected PRPG up or down, in PRPG points. These are the ten largest, leaving out his current PRPG, which appears on its own below.</p>
            <p className="def-p">The model starts from the average transfer and adds every factor's effect. The row under the bars adds those pieces up to his projection.</p>
          </SectionHead>
          <DriverBars player={player} />
        </section>

        {zones && zonesSection}
        <section aria-labelledby="career">
          <SectionHead id="career" title="Career">
            <p className="def-p">His PRPG in each college season. A dashed vertical line marks a school change, and a dotted line spans a season with no games on record.</p>
          </SectionHead>
          <CareerChart career={player.career} name={bio.player} />
        </section>

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
            <p className="def-p">The three past transfers to a high-major whose stats before the move were closest to his.</p>
            <p className="def-p">Projected is what the model predicted for that move without seeing its result. It is blank when the model has no such prediction for that season.</p>
          </SectionHead>
          {player.comps.length ? (
            <table className={styles.table}>
              <thead><tr><th scope="col">Player</th><th scope="col">Projected</th><th scope="col">Actual</th></tr></thead>
              <tbody>
                {player.comps.map((c) => (
                  <tr key={`${c.player}-${c.dest_season}`}>
                    <th scope="row">
                      <span className={styles.compName}>{c.player}</span>
                      <span className={styles.move}>{c.from_team} to {c.to_team}, {c.season_label}</span>
                    </th>
                    <td>{num(c.projected_porpag, 2)}</td>
                    <td className={styles.strong}>{num(c.actual_porpag, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className={styles.empty}>No close comparisons among past transfers.</p>}
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
        {!zones && zonesSection}
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
