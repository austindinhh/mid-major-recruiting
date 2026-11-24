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
const ZONES: ZoneKey[] = ["rim", "mid", "three"];
const SHORT_NAMES: Record<ZoneKey, string> = { rim: "Rim", mid: "Midrange", three: "Three" };
// The compact court prints FG% and the average; the full court prints FG% and a plain verdict against the average.
const LABEL_AT: Record<ZoneKey, [number, number]> = { rim: [250, 90], mid: [118, 160], three: [250, 294] };
const FULL_LABEL_AT: Record<ZoneKey, [number, number]> = { rim: [250, 96], mid: [124, 142], three: [250, 300] };

interface Props {
  zones: Record<ZoneKey, Zone>;
  averages: Record<ZoneKey, ZoneAverage> | null;
  title: string;
  compact?: boolean;
}

export function Court({ zones, averages, title, compact = false }: Props) {
  const fill = (z: ZoneKey) => BIN_FILL[zoneBin(zoneDiff(zones[z], averages?.[z])) ?? "mid"];
  const clip = `court${useId().replace(/[^\w-]/g, "")}`;
  const describe = (z: ZoneKey) => {
    const avg = averages?.[z]?.pct;
    return `${ZONE_NAMES[z]}: ${Math.round(zones[z].share * 100)}% of shots, ${pctText(zones[z].pct)} made` +
      (avg != null ? `, D1 average ${pctText(avg)}` : "");
  };

  return (
    <svg className={`${styles.court} ${compact ? styles.compact : styles.full}`} viewBox="0 0 500 330" role="img" aria-label={`${title}. ${ZONES.map(describe).join(". ")}.`}>
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
        {ZONES.map((z) => {
          const [x, y] = (compact ? LABEL_AT : FULL_LABEL_AT)[z];
          const avg = averages?.[z]?.pct;
          return (
            <text key={z} x={x} y={y}>
              <tspan className={styles.rate}>{pctText(zones[z].pct)}</tspan>
              {compact && avg != null && <tspan x={x} dy="1.2em">Avg {(avg * 100).toFixed(1)}</tspan>}
              {!compact && <tspan className={styles.verdict} x={x} dy="1.45em">{verdict(zoneDiff(zones[z], averages?.[z]))}</tspan>}
            </text>
          );
        })}
      </g>
    </svg>
  );
}

// FG% minus the D1 average in percentage points, from the rounded values that are printed.
function zoneDiff(zone: Zone, avg: ZoneAverage | undefined): number | null {
  if (zone.pct == null || avg?.pct == null) return null;
  return Number((zone.pct * 100).toFixed(1)) - Number((avg.pct * 100).toFixed(1));
}

// Matches the color bins: within 2 points reads as average.
function verdict(d: number | null): string {
  if (d == null) return "";
  if (Math.abs(d) < 2) return "Near avg";
  return `${Math.abs(d).toFixed(1)} ${d > 0 ? "above" : "below"} avg`;
}

// Where his shots come from, as one bar split by share, rim to three. Labels sit under their segment;
// narrow segments push their neighbors over rather than overlap them.
export function ShotMix({ zones }: { zones: Record<ZoneKey, Zone> }) {
  return (
    <figure className={styles.shotMix} aria-label={`Shot mix: ${ZONES.map((z) => `${SHORT_NAMES[z]} ${Math.round(zones[z].share * 100)}%, ${zones[z].att} shots`).join("; ")}`}>
      <div className={styles.mixBar} aria-hidden="true">
        {ZONES.map((z) => <span key={z} style={{ flexBasis: `${zones[z].share * 100}%` }} />)}
      </div>
      <div className={styles.mixLabels} aria-hidden="true">
        {ZONES.map((z) => (
          <span key={z} style={{ flexBasis: `${zones[z].share * 100}%` }}>
            <b>{SHORT_NAMES[z]} {Math.round(zones[z].share * 100)}%</b>
            <span>{zones[z].att} shots</span>
          </span>
        ))}
      </div>
    </figure>
  );
}

// The full court labels each zone in words, so its key only needs the three meanings.
// Better and worse each show both of their steps, so the key matches whichever one the court uses.
export function CourtKey({ group }: { group: string }) {
  return (
    <p className={styles.courtKey}>
      <span><i className="bin-hi1" /><i className="bin-hi2" />Better than D1 {group}</span>
      <span><i style={{ background: "var(--div-mid)" }} />Near average</span>
      <span><i className="bin-lo1" /><i className="bin-lo2" />Worse</span>
    </p>
  );
}

// The drawer's caption: share of shots and the five-step scale.
export function ZoneLegend({ zones }: { zones: Record<ZoneKey, Zone> }) {
  const titleId = useId();
  return (
    <div className={styles.caption}>
      <dl className={styles.mix}>
        <dt>Share of shots</dt>
        {ZONES.map((z) => (
          <div key={z}><dt>{SHORT_NAMES[z]}</dt><dd>{Math.round(zones[z].share * 100)}%</dd></div>
        ))}
      </dl>
      <p className={styles.legendTitle} id={titleId}>FG% compared with the D1 average at his position</p>
      <ol className={styles.legend} aria-labelledby={titleId}>
        <li><span className="bin-lo2" />6+ pts worse</li>
        <li><span className="bin-lo1" />2 to 6 worse</li>
        <li><span style={{ background: "var(--div-mid)" }} />Within 2</li>
        <li><span className="bin-hi1" />2 to 6 better</li>
        <li><span className="bin-hi2" />6+ pts better</li>
      </ol>
    </div>
  );
}
