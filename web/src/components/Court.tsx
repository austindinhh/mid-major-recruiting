import { useId } from "react";
import type { Zone, ZoneAverage, ZoneKey } from "../data/types";
import { pctText, zoneBin, type PctBin } from "../lib/format";
import styles from "./Court.module.css";

// NCAA half court at 10 units per foot, baseline at the top. The rim zone is drawn
// as a 7.2 ft circle; the data only says "at the rim", not a measured radius.
const RIM = { cx: 250, cy: 52.5 };
const THREE_PATH = "M33.5 0 V99.3 A221.5 221.5 0 0 0 466.5 99.3 V0";

const ZONE_NAMES: Record<ZoneKey, string> = { rim: "At the rim", mid: "Midrange", three: "Three-pointers" };
const BIN_FILL: Record<PctBin, string> = {
  lo2: "var(--div-warm-2)", lo1: "var(--div-warm-1)", mid: "var(--div-mid)", hi1: "var(--div-cool-1)", hi2: "var(--div-cool-2)",
};
const LABEL_AT: Record<ZoneKey, [number, number]> = { rim: [250, 90], mid: [118, 160], three: [250, 294] };

interface Props {
  zones: Record<ZoneKey, Zone>;
  averages: Record<ZoneKey, ZoneAverage> | null;
  title: string;
  compact?: boolean;
}

export function Court({ zones, averages, title, compact = false }: Props) {
  const diff = (z: ZoneKey) => {
    const avg = averages?.[z]?.pct;
    const pct = zones[z].pct;
    return avg == null || pct == null ? null : (pct - avg) * 100;
  };
  const fill = (z: ZoneKey) => BIN_FILL[zoneBin(diff(z)) ?? "mid"];
  const clip = `court${useId().replace(/[^\w-]/g, "")}`;
  const describe = (z: ZoneKey) => {
    const avg = averages?.[z]?.pct;
    return `${ZONE_NAMES[z]}: ${Math.round(zones[z].share * 100)}% of shots, ${pctText(zones[z].pct)} made` +
      (avg != null ? `, D1 average ${pctText(avg)}` : "");
  };

  return (
    <svg className={`${styles.court} ${compact ? styles.compact : ""}`} viewBox="0 0 500 330" role="img" aria-label={`${title}. ${(["rim", "mid", "three"] as ZoneKey[]).map(describe).join(". ")}.`}>
      <defs><clipPath id={clip}><rect x="0" y="0" width="500" height="330" /></clipPath></defs>
      <g clipPath={`url(#${clip})`}>
        <rect className={styles.zone} x="0" y="0" width="500" height="330" fill={fill("three")}><title>{describe("three")}</title></rect>
        <path className={styles.zone} d={`${THREE_PATH} Z`} fill={fill("mid")}><title>{describe("mid")}</title></path>
        <circle className={styles.zone} cx={RIM.cx} cy={RIM.cy} r="72" fill={fill("rim")}><title>{describe("rim")}</title></circle>
      </g>
      <g className={styles.lines} pointerEvents="none">
        <rect x="1" y="1" width="498" height="328" />
        <path d={THREE_PATH} />
        <rect x="190" y="0" width="120" height="190" />
        <path d="M190 190 A60 60 0 0 0 310 190" />
        <path d="M220 40 H280" />
        <circle cx={RIM.cx} cy={RIM.cy} r="9" />
      </g>
      <g className={styles.labels} pointerEvents="none" aria-hidden="true">
        {(["rim", "mid", "three"] as ZoneKey[]).map((z) => {
          const [x, y] = LABEL_AT[z];
          const avg = averages?.[z]?.pct;
          return (
            <text key={z} x={x} y={y}>
              <tspan className={styles.rate}>{pctText(zones[z].pct)}</tspan>
              {avg != null && <tspan x={x} dy="1.2em">Avg {compact ? (avg * 100).toFixed(1) : pctText(avg)}</tspan>}
            </text>
          );
        })}
      </g>
    </svg>
  );
}

export function ZoneLegend({ zones }: { zones: Record<ZoneKey, Zone> }) {
  return (
    <div className={styles.caption}>
      <dl className={styles.mix}>
        <dt>Share of shots</dt>
        {(["rim", "mid", "three"] as ZoneKey[]).map((z) => (
          <div key={z}><dt>{z === "rim" ? "Rim" : z === "mid" ? "Midrange" : "Three"}</dt><dd>{Math.round(zones[z].share * 100)}%</dd></div>
        ))}
      </dl>
      <p className={styles.legendTitle} id="zone-legend-title">Make rate vs D1 average, in percentage points</p>
      <ol className={styles.legend} aria-labelledby="zone-legend-title">
        <li><span className="bin-lo2" />6+ below</li>
        <li><span className="bin-lo1" />2 to 6 below</li>
        <li><span style={{ background: "var(--div-mid)" }} />Within 2</li>
        <li><span className="bin-hi1" />2 to 6 above</li>
        <li><span className="bin-hi2" />6+ above</li>
      </ol>
    </div>
  );
}
