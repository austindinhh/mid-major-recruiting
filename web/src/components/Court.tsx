import { useId } from "react";
import type { Zone, ZoneAverage, ZoneKey } from "../data/types";
import { pctText } from "../lib/format";
import styles from "./Court.module.css";

// NCAA half court at 10 units per foot, baseline at the top. The rim zone is drawn
// as an 8.8 ft circle; the data only says "at the rim", not a measured radius, so it is sized to hold its labels.
const RIM = { cx: 250, cy: 52.5 };
const THREE_PATH = "M33.5 0 V99.3 A221.5 221.5 0 0 0 466.5 99.3 V0";

const ZONE_NAMES: Record<ZoneKey, string> = { rim: "At the rim", mid: "Midrange", three: "Three-pointers" };
// Three levels only: the court labels each zone with its exact gap, so color just sorts better, near and worse.
type Level = "better" | "near" | "worse";
const LEVEL_FILL: Record<Level, string> = { better: "var(--zone-better)", near: "var(--zone-near)", worse: "var(--zone-worse)" };
const NEAR_PTS = 2;
const ZONES: ZoneKey[] = ["rim", "mid", "three"];
const SHORT_NAMES: Record<ZoneKey, string> = { rim: "Rim", mid: "Midrange", three: "Three" };
// The compact court prints FG% and the average; the full court prints FG% and a plain verdict against the average.
const LABEL_AT: Record<ZoneKey, [number, number]> = { rim: [250, 90], mid: [118, 160], three: [250, 294] };
const FULL_LABEL_AT: Record<ZoneKey, [number, number]> = { rim: [250, 100], mid: [124, 142], three: [250, 300] };

interface Props {
  zones: Record<ZoneKey, Zone>;
  averages: Record<ZoneKey, ZoneAverage> | null;
  title: string;
  compact?: boolean;
}

export function Court({ zones, averages, title, compact = false }: Props) {
  const fill = (z: ZoneKey) => LEVEL_FILL[level(zoneDiff(zones[z], averages?.[z]))];
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
        <circle className={styles.zone} cx={RIM.cx} cy={RIM.cy} r="88" fill={fill("rim")}><title>{describe("rim")}</title></circle>
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

const level = (d: number | null): Level => (d == null || Math.abs(d) < NEAR_PTS ? "near" : d > 0 ? "better" : "worse");

function verdict(d: number | null): string {
  if (d == null) return "";
  if (Math.abs(d) < NEAR_PTS) return "Near avg";
  return `${Math.abs(d).toFixed(1)} ${d > 0 ? "above" : "below"} avg`;
}

// Where his shots come from: one bar split by share, rim to three, each part filled like its court zone.
// Labels sit inside and drop detail as a part narrows (container queries in the CSS).
export function ShotMix({ zones, averages }: { zones: Record<ZoneKey, Zone>; averages: Record<ZoneKey, ZoneAverage> | null }) {
  return (
    <figure className={styles.shotMix} aria-label={`Shot mix: ${ZONES.map((z) => `${SHORT_NAMES[z]} ${Math.round(zones[z].share * 100)}%, ${zones[z].att} shots`).join("; ")}`}>
      {ZONES.map((z) => (
        <div key={z} className={styles.part} style={{ flexBasis: `${zones[z].share * 100}%`, background: LEVEL_FILL[level(zoneDiff(zones[z], averages?.[z]))] }} aria-hidden="true">
          <span className={styles.partText}>
            <b><span className={styles.partName}>{z === "mid" ? "Mid" : SHORT_NAMES[z]} </span>{Math.round(zones[z].share * 100)}%</b>
            <span className={styles.partAtt}>{zones[z].att} shots</span>
          </span>
        </div>
      ))}
    </figure>
  );
}

export function CourtKey({ group }: { group: string }) {
  return (
    <p className={styles.courtKey}>
      <span><i style={{ background: LEVEL_FILL.better }} />Better than D1 {group}</span>
      <span><i style={{ background: LEVEL_FILL.near }} />Within {NEAR_PTS} pts</span>
      <span><i style={{ background: LEVEL_FILL.worse }} />Worse</span>
    </p>
  );
}

// The drawer's caption: share of shots, then the same key as the full court.
export function ZoneLegend({ zones, group }: { zones: Record<ZoneKey, Zone>; group: string }) {
  return (
    <div className={styles.caption}>
      <dl className={styles.mix}>
        <dt>Share of shots</dt>
        {ZONES.map((z) => (
          <div key={z}><dt>{SHORT_NAMES[z]}</dt><dd>{Math.round(zones[z].share * 100)}%</dd></div>
        ))}
      </dl>
      <CourtKey group={group} />
    </div>
  );
}
