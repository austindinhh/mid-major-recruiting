import { heatGradient } from "../lib/heat";
import { useDarkMode } from "../lib/useDarkMode";
import styles from "./HeatKey.module.css";

const TICKS = [10, 25, 50, 75, 90];

// The board's shading scale, drawn from the same function that colors the cells.
export function HeatKey() {
  const dark = useDarkMode();
  return (
    <figure className={styles.key} aria-label="Shading key: position percentile. Orange below the 50th, deeper toward the bottom; blue above the 50th, deeper toward the top.">
      <figcaption className={styles.title}>Position percentile</figcaption>
      <div className={styles.scale}>
        <span className={styles.end}>Worse</span>
        <div className={styles.track}>
          <div className={styles.bar} style={{ background: heatGradient(dark) }} />
          <div className={styles.ticks} aria-hidden="true">
            {TICKS.map((t) => <span key={t} style={{ left: `${t}%` }}>{t}</span>)}
          </div>
        </div>
        <span className={styles.end}>Better</span>
      </div>
    </figure>
  );
}
