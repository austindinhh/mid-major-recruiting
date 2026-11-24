import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { loadPlayer, loadZoneAverages } from "../data/load";
import type { BoardRow, PctStat, PlayerFile, ZoneAverages } from "../data/types";
import { className, height, num, ordinal, pctShown } from "../lib/format";
import { confName } from "../lib/conferences";
import { heatStyle } from "../lib/heat";
import { useDarkMode } from "../lib/useDarkMode";
import { Court, ZoneLegend } from "./Court";
import styles from "./PlayerDrawer.module.css";

interface Props {
  row: BoardRow | null;
  season: number;
  boardSize: number;
  onClose: () => void;
}

const STRIP: { key: PctStat; label: string; digits: number }[] = [
  { key: "porpag", label: "PRPG", digits: 2 },
  { key: "dporpag", label: "Def PRPG", digits: 2 },
  { key: "ppg", label: "PPG", digits: 1 },
  { key: "usg", label: "USG%", digits: 1 },
  { key: "ts", label: "TS%", digits: 1 },
  { key: "ast", label: "AST%", digits: 1 },
];

export function PlayerDrawer({ row, season, boardSize, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const dark = useDarkMode();
  const location = useLocation();
  // Results are tagged with the player they belong to, so a stale load never shows.
  const [loaded, setLoaded] = useState<{ key: string; player?: PlayerFile; averages?: ZoneAverages; error?: string } | null>(null);
  const key = row ? `${season}/${row.id}` : "";
  const current = loaded?.key === key ? loaded : null;
  const player = current?.player ?? null;
  const averages = current?.averages ?? null;
  const error = current?.error ?? null;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (row && !dialog.open) dialog.showModal();
    if (!row && dialog.open) dialog.close();
  }, [row]);

  useEffect(() => {
    if (!row) return;
    let live = true;
    const k = `${season}/${row.id}`;
    Promise.all([loadPlayer(season, row.id), loadZoneAverages(season)]).then(
      ([p, a]) => { if (live) setLoaded({ key: k, player: p, averages: a }); },
      (e: Error) => { if (live) setLoaded({ key: k, error: e.message }); },
    );
    return () => { live = false; };
  }, [row, season]);

  const stat = (key: PctStat) => (key === "ppg" ? player?.stats.ppg : key === "porpag" ? row?.porpag : key === "dporpag" ? row?.dporpag : player?.stats[key]) ?? null;

  return (
    <dialog
      ref={ref}
      className={styles.drawer}
      aria-labelledby="drawer-name"
      onClose={onClose}
      onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.close(); }}
    >
      {row && (
        <div className={styles.body}>
          <button type="button" className={styles.close} onClick={() => ref.current?.close()} aria-label="Close player summary">
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </button>

          <section className={styles.plate} aria-label="Player summary">
            <div className={styles.name}>
              <h2 id="drawer-name">{row.player}</h2>
              <dl className={styles.facts}>
                <div><dt>Position</dt><dd>{row.pos ?? "–"}</dd></div>
                <div><dt>Height</dt><dd>{height(row.inches)}</dd></div>
                <div><dt>Class</dt><dd>{className(row.exp)}</dd></div>
                <div><dt>Games</dt><dd>{row.g}</dd></div>
              </dl>
            </div>
            <div className={styles.team}><span>{row.team}</span> <span className={styles.conf}>{confName(row.conf)}</span></div>
            <div className={styles.proj}>
              <span className={styles.projValue}>{num(row.projected_porpag, 2)}</span>
              <span className={styles.projLabel}>Projected PRPG at a Big Ten school</span>
              <span>Ranked {row.rank}/{boardSize.toLocaleString()} on the board</span>
            </div>
          </section>

          <dl className={styles.strip}>
            {STRIP.map((s) => {
              const p = pctShown(row.pct[s.key]);
              return (
                <div key={s.key}>
                  <dt>{s.label}</dt>
                  <dd>{player || s.key === "porpag" || s.key === "dporpag" ? num(stat(s.key), s.digits) : <span className="skeleton" style={{ display: "inline-block", width: 36, height: 18 }} />}</dd>
                  {p != null && <dd className={styles.chip} style={heatStyle(p, dark)}>{ordinal(p)}</dd>}
                </div>
              );
            })}
          </dl>

          <section aria-labelledby="drawer-zones">
            <h3 id="drawer-zones" className={styles.h3}>Shot Zones</h3>
            {error && <p className={styles.error}>{error} Try reopening the player.</p>}
            {!error && !player && <div className="skeleton" style={{ aspectRatio: "500 / 330" }} />}
            {player && player.zones && (
              <>
                <Court zones={player.zones} averages={averages?.[player.bio.pos ?? ""] ?? averages?.all ?? null} title={`Shot zones for ${row.player}`} compact />
                <ZoneLegend zones={player.zones} />
              </>
            )}
            {player && !player.zones && <p className={styles.empty}>No shot-zone data for this season.</p>}
          </section>

          <Link className={styles.full} to={`/player/${row.id}?season=${season}`} state={{ back: `/${location.search}` }}>Open the full player page</Link>
        </div>
      )}
    </dialog>
  );
}
