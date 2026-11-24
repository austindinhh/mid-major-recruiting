import type { PlayerFile } from "../data/types";
import { num, signed } from "../lib/format";
import styles from "./DriverBars.module.css";

// A ledger that sums to the projection: the starting point and his current PRPG, the ten largest
// other factors as bars diverging from a center line, everything left over, then the total.
export function DriverBars({ player }: { player: PlayerFile }) {
  const { drivers, projection } = player;
  const max = Math.max(...drivers.map((d) => Math.abs(d.value)), 0.01);
  const own = projection.porpag_contribution ?? 0;
  const rest = projection.projected_porpag - projection.bias - own - drivers.reduce((s, d) => s + d.value, 0);

  return (
    <ol className={styles.ledger} aria-label="How his projection adds up">
      <li className={styles.plain}>
        <span className={styles.label}>Average transfer</span>
        <span className={styles.value}>{num(projection.bias, 2)}</span>
      </li>
      <li className={styles.plain}>
        <span className={styles.label}>His current PRPG</span>
        <span className={styles.value}>{signed(own)}</span>
      </li>
      {drivers.map((d, i) => {
        const w = `${(Math.abs(d.value) / max) * 50}%`;
        return (
          <li key={d.feature} className={i === 0 ? styles.first : undefined}>
            <span className={styles.label}>{d.label}</span>
            <span className={styles.track} aria-hidden="true">
              <span className={d.value >= 0 ? styles.pos : styles.neg} style={d.value >= 0 ? { left: "50%", width: w } : { right: "50%", width: w }} />
            </span>
            <span className={styles.value}>{signed(d.value)}</span>
          </li>
        );
      })}
      <li className={`${styles.plain} ${styles.after}`}>
        <span className={styles.label}>All other factors</span>
        <span className={styles.value}>{signed(rest)}</span>
      </li>
      <li className={`${styles.plain} ${styles.total}`}>
        <span className={styles.label}>Projected PRPG</span>
        <span className={styles.value}>{num(projection.projected_porpag, 2)}</span>
      </li>
    </ol>
  );
}
