import type { PlayerFile } from "../data/types";
import { num } from "../lib/format";
import { useWidth } from "../lib/useWidth";
import styles from "./CareerChart.module.css";

type Season = PlayerFile["career"][number];

const HEIGHT = 240;
const PAD = { top: 56, right: 24, bottom: 32, left: 36 };
const CHAR_W = 6.6; // rough width of a 12px semibold character, for label collisions

function ticks(lo: number, hi: number): number[] {
  const step = hi - lo > 4 ? 2 : hi - lo > 1.5 ? 1 : 0.5;
  const out: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) out.push(Number(t.toFixed(2)));
  return out;
}

// PRPG by season with a dashed line at each school change.
export function CareerChart({ career, name }: { career: Season[]; name: string }) {
  const [ref, width] = useWidth<HTMLDivElement>(520);
  const seasons = career.filter((c) => c.porpag != null);
  if (seasons.length === 0) return <p className={styles.empty}>No PRPG on record for his college seasons.</p>;

  const values = seasons.map((s) => s.porpag as number);
  const lo = Math.floor(Math.min(0, ...values) * 2) / 2;
  const hi = Math.max(lo + 1, Math.ceil(Math.max(...values) * 2) / 2);
  const first = seasons[0].year, last = seasons[seasons.length - 1].year;
  const innerW = width - PAD.left - PAD.right, innerH = HEIGHT - PAD.top - PAD.bottom;
  // Points sit inset from the axes so the first and last labels clear the tick labels.
  const inset = 24;
  const x = (year: number) => PAD.left + inset + (last === first ? (innerW - 2 * inset) / 2 : ((year - first) / (last - first)) * (innerW - 2 * inset));
  const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * innerH;
  const moves = seasons.slice(1).filter((s, i) => s.team !== seasons[i].team);
  // Consecutive seasons join with a solid line; a skipped season (no games on record) gets a dashed bridge.
  const segments = seasons.slice(1).map((s, i) => ({
    key: s.year, gap: s.year - seasons[i].year > 1,
    d: `M${x(seasons[i].year)} ${y(seasons[i].porpag as number)} L${x(s.year)} ${y(s.porpag as number)}`,
  }));
  // Labels go under a point that sits below its neighbors, so they don't sit on the line.
  const below = (i: number) => {
    const v = values[i], n = [values[i - 1], values[i + 1]].filter((u) => u != null);
    return n.length > 0 && n.every((u) => u > v);
  };
  const narrow = width < 420;

  // School labels across the top: the first school at the left edge, then one beside each move line.
  // A label that would overlap the one before it drops to a second row.
  const labels: { key: number; team: string; x: number; y: number; anchor: "start" | "end"; line: number | null }[] = [];
  const rowEnds = [-Infinity, -Infinity];
  const place = (key: number, team: string, at: number, line: number | null) => {
    const w = team.length * CHAR_W;
    const flip = at + 6 + w > width;
    const x = line == null ? at : flip ? at - 6 : at + 6;
    const [l, r] = flip ? [x - w, x] : [x, x + w];
    const row = l > rowEnds[0] + 8 ? 0 : 1;
    rowEnds[row] = Math.max(rowEnds[row], r);
    labels.push({ key, team, x, y: 14 + row * 18, anchor: flip ? "end" : "start", line });
  };
  place(seasons[0].year, seasons[0].team, PAD.left, null);
  for (const s of moves) {
    const prev = seasons[seasons.indexOf(s) - 1];
    place(s.year, s.team, (x(prev.year) + x(s.year)) / 2, (x(prev.year) + x(s.year)) / 2);
  }

  const summary = seasons
    .map((s) => `${s.season_label} at ${s.team}: ${num(s.porpag, 2)}`)
    .join("; ");

  return (
    <div ref={ref} className={styles.wrap}>
      <svg width={width} height={HEIGHT} role="img" aria-label={`PRPG by season for ${name}. ${summary}.`}>
        <g className={styles.grid}>
          {ticks(lo, hi).map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} className={t === 0 ? styles.zero : undefined} />
              <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end">{num(t, t % 1 ? 1 : 0)}</text>
            </g>
          ))}
          <text x={PAD.left - 8} y={PAD.top - 20} textAnchor="end">PRPG</text>
        </g>
        {labels.map((l) => (
          <g key={l.key}>
            {l.line != null && <line className={styles.move} x1={l.line} x2={l.line} y1={PAD.top - 12} y2={HEIGHT - PAD.bottom} />}
            <text className={styles.team} x={l.x} y={l.y} textAnchor={l.anchor}>{l.team}</text>
          </g>
        ))}
        {segments.map((g) => <path key={g.key} className={g.gap ? styles.gap : styles.line} d={g.d} />)}
        {seasons.map((s, i) => (
          <g key={s.year}>
            <circle className={styles.point} cx={x(s.year)} cy={y(s.porpag as number)} r="5">
              <title>{`${s.season_label}, ${s.team}: PRPG ${num(s.porpag, 2)} in ${s.g} games`}</title>
            </circle>
            <text className={styles.value} x={x(s.year)} y={y(s.porpag as number) + (below(i) ? 20 : -12)} textAnchor="middle">{num(s.porpag, 2)}</text>
            <text className={styles.axis} x={x(s.year)} y={HEIGHT - 10} textAnchor="middle">
              {narrow ? `’${String(s.year).slice(2)}` : s.season_label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
