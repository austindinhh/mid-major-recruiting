import type { CSSProperties } from "react";
import styles from "./FilterBar.module.css";

interface Props {
  label: string;
  help?: string | null;
  min: number;
  max: number;
  step: number;
  value: [number, number];
  format: (v: number) => string;
  onChange: (value: [number, number]) => void;
}

// Two native range inputs over one track, so both handles keep keyboard and screen reader support.
export function RangeSlider({ label, help, min, max, step, value, format, onChange }: Props) {
  const [lo, hi] = value;
  const pct = (v: number) => ((v - min) / (max - min)) * 100;
  return (
    <fieldset className={styles.range}>
      <legend>
        {label} <output>{format(lo)} to {format(hi)}</output>
      </legend>
      <div className={styles.rangeTrack} style={{ "--lo": `${pct(lo)}%`, "--hi": `${pct(hi)}%` } as CSSProperties}>
        <input
          type="range" min={min} max={max} step={step} value={lo} aria-label={`Minimum ${label.toLowerCase()}`}
          aria-valuetext={format(lo)}
          onChange={(e) => onChange([Math.min(Number(e.target.value), hi), hi])}
        />
        <input
          type="range" min={min} max={max} step={step} value={hi} aria-label={`Maximum ${label.toLowerCase()}`}
          aria-valuetext={format(hi)}
          onChange={(e) => onChange([lo, Math.max(Number(e.target.value), lo)])}
        />
      </div>
      {help && <p className={styles.rangeHelp}>{help}</p>}
    </fieldset>
  );
}
