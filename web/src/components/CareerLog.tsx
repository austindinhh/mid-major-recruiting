import { Fragment } from "react";
import type { PlayerFile } from "../data/types";
import { confName } from "../lib/conferences";
import { num, seasonLabel } from "../lib/format";
import styles from "./CareerLog.module.css";

type Season = PlayerFile["career"][number];

// One stat line per college season, oldest first. A school change gets a divider row, and a skipped
// season gets its own row, so moves and gaps show without reading the school column.
export function CareerLog({ career, current }: { career: Season[]; current: number }) {
  const values = career.map((s) => s.porpag ?? 0);
  const lo = Math.min(0, ...values), hi = Math.max(1, ...values);
  const at = (v: number) => ((v - lo) / (hi - lo)) * 100;

  return (
    <div className={styles.scroll}><table className={styles.log}>
      <thead>
        <tr>
          <th scope="col">Season</th><th scope="col">School</th><th scope="col">G</th>
          <th scope="col" className={styles.wide}>MPG</th><th scope="col">PPG</th><th scope="col" className={styles.wide}>TS%</th>
          <th scope="col">PRPG</th>
        </tr>
      </thead>
      <tbody>
        {career.map((s, i) => {
          const prev = career[i - 1];
          const gap = prev ? s.year - prev.year - 1 : 0;
          const moved = prev && prev.team !== s.team;
          const v = s.porpag;
          return (
            <Fragment key={s.year}>
              {gap > 0 && Array.from({ length: gap }, (_, k) => prev.year + k + 1).map((y) => (
                <tr key={y} className={styles.note}><th scope="row">{seasonLabel(y)}</th><td colSpan={6}>No D1 games on record</td></tr>
              ))}
              {moved && <tr className={styles.move}><td colSpan={7}>Transferred to {s.team}</td></tr>}
              <tr className={s.year === current ? styles.current : undefined}>
                <th scope="row">{s.season_label}</th>
                <td className={styles.school}>{s.team}<span>{confName(s.conf)}</span></td>
                <td>{s.g}</td>
                <td className={styles.wide}>{num(s.mpg, 1)}</td>
                <td>{num(s.ppg, 1)}</td>
                <td className={styles.wide}>{num(s.ts, 1)}</td>
                <td><span className={styles.prpg}>
                  <span className={styles.bar} aria-hidden="true">
                    {v != null && (
                      <i className={v >= 0 ? styles.pos : styles.neg}
                        style={{ left: `${Math.min(at(0), at(v))}%`, width: `${Math.abs(at(v) - at(0))}%` }} />
                    )}
                  </span>
                  <b>{num(v, 2)}</b>
                </span></td>
              </tr>
            </Fragment>
          );
        })}
      </tbody>
    </table></div>
  );
}
