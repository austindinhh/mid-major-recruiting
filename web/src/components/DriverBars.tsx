import type { PlayerFile } from "../data/types";
import { num, signed } from "../lib/format";
import styles from "./DriverBars.module.css";

// Bars diverge from a shared center line, scaled to the largest factor shown.
export function DriverBars({ player }: { player: PlayerFile }) {
  const { drivers, projection } = player;
  const max = Math.max(...drivers.map((d) => Math.abs(d.value)), 0.01);
  const shown = drivers.reduce((s, d) => s + d.value, 0);
  const own = projection.porpag_contribution ?? 0;
  const rest = projection.projected_porpag - projection.bias - own - shown;

  return (
    <>
      <ol className={styles.bars} aria-label="Factors that move his projection, largest first">
        {drivers.map((d) => {
          const w = `${(Math.abs(d.value) / max) * 50}%`;
          return (
            <li key={d.feature}>
              <span className={styles.label}>{d.label}</span>
              <span className={styles.track} aria-hidden="true">
                <span className={d.value >= 0 ? styles.pos : styles.neg} style={d.value >= 0 ? { left: "50%", width: w } : { right: "50%", width: w }} />
              </span>
              <span className={styles.value}>{signed(d.value)}</span>
            </li>
          );
        })}
      </ol>
      <dl className={styles.bridge}>
        <div><dt>Average transfer</dt><dd>{num(projection.bias, 2)}</dd></div>
        <div><dt>Current PRPG</dt><dd>{signed(own)}</dd></div>
        <div><dt>Top 10 factors</dt><dd>{signed(shown)}</dd></div>
        <div><dt>Other factors</dt><dd>{signed(rest)}</dd></div>
        <div className={styles.total}><dt>Projected</dt><dd>{num(projection.projected_porpag, 2)}</dd></div>
      </dl>
    </>
  );
}
