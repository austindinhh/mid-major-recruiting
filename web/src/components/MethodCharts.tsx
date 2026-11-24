import type { MethodologyFile } from "../data/types";
import { num } from "../lib/format";
import { ROLES } from "../lib/roles";
import { useWidth } from "../lib/useWidth";
import styles from "./MethodCharts.module.css";

type Data = MethodologyFile;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// What moving up to a high-major typically does, by the role a player had before the move. Each row shows
// the typical player before and after, and the range where the middle half of players landed.
export function MovingUp({ rows }: { rows: Data["moving_up"] }) {
  const lo = 0, hi = 5;
  const at = (v: number) => `${((clamp(v, lo, hi) - lo) / (hi - lo)) * 100}%`;
  const roles = ROLES.filter((r) => r.to > lo);
  return (
    <figure className={styles.movers} aria-label={`What moving up typically does. ${rows.map((r) => `${ROLES[r.role].name} before: typically ${num(r.before, 1)} PRPG before and ${num(r.after, 1)} after`).join(". ")}.`}>
      <div className={styles.moverHead} aria-hidden="true">
        <span className={styles.colHead}>Before moving up</span>
        <span className={styles.roleTrack}>
          {roles.map((r) => <span key={r.name} style={{ left: at(r.from), width: `calc(${at(Math.min(r.to, hi))} - ${at(r.from)})` }}>{r.name}</span>)}
        </span>
      </div>
      {[...rows].reverse().map((r) => {
        const [a, b] = r.after <= r.before ? [r.after, r.before] : [r.before, r.after];
        return (
          <div key={r.role} className={styles.moverRow} aria-hidden="true">
            <span className={styles.moverName}><b>{ROLES[r.role].name}</b></span>
            <span className={styles.moverTrack}>
              {roles.slice(1).map((x) => <i key={x.name} className={styles.divider} style={{ left: at(x.from) }} />)}
              <i className={styles.range} style={{ left: at(r.after_p25), width: `calc(${at(r.after_p75)} - ${at(r.after_p25)})` }} />
              <i className={styles.moverLine} style={{ left: at(a), width: `calc(${at(b)} - ${at(a)})` }} />
              {Math.abs(r.after - r.before) > 0.3 && (
                <i className={r.after < r.before ? styles.arrowLeft : styles.arrowRight} style={{ left: at(r.after) }} />
              )}
              <i className={styles.dotBefore} style={{ left: at(r.before) }} />
              <i className={styles.dotActual} style={{ left: at(r.after) }} />
            </span>
          </div>
        );
      })}
      <p className={styles.key}>
        <span><i className={styles.keyBefore} />Typical player before</span>
        <span><i className={styles.keyActual} />Typical player after</span>
        <span><i className={styles.keyRange} />Where most players landed</span>
      </p>
    </figure>
  );
}

// For each role the model projected, the share of past players who actually ended up in each role.
export function RoleOutcomes({ roles }: { roles: Data["roles"] }) {
  return (
    <figure className={styles.outcomes} aria-label={`What players became, by projected role. ${roles.map((r) => `Projected ${ROLES[r.role].name}: ${r.shares.map((v, k) => `${Math.round(v * 100)}% ${ROLES[k].name}`).join(", ")}`).join(". ")}.`}>
      <div className={styles.outRow} aria-hidden="true">
        <span className={styles.colHead}>Model projected</span>
        <span className={styles.colHead}>What they became</span>
      </div>
      {roles.map((r) => (
        <div key={r.role} className={styles.outRow} aria-hidden="true">
          <span className={styles.outLabel}><b>{ROLES[r.role].name}</b></span>
          <span className={styles.outBar}>
            {r.shares.map((v, k) => v > 0 && (
              <span key={k} className={styles[`seg${k}`]} style={{ flexGrow: v }} title={`${Math.round(v * 100)}% became ${ROLES[k].name.toLowerCase()}`}>
                {v >= 0.1 && `${Math.round(v * 100)}%`}
              </span>
            ))}
          </span>
        </div>
      ))}
      <p className={styles.key}>
        {ROLES.map((r, k) => <span key={r.name}><i className={styles[`seg${k}`]} />{r.name}</span>)}
      </p>
    </figure>
  );
}

// Past transfers on the two stats the match weighs most, with one player and his three comps.
export function CompScatter({ demo }: { demo: NonNullable<Data["comp_demo"]> }) {
  const [ref, width] = useWidth<HTMLDivElement>(640);
  const H = width < 480 ? 300 : 360, pad = { top: 16, right: 16, bottom: 44, left: 48 };
  const xLo = -2, xHi = 7, yLo = -1, yHi = 5;
  const x = (v: number) => pad.left + ((clamp(v, xLo, xHi) - xLo) / (xHi - xLo)) * (width - pad.left - pad.right);
  const y = (v: number) => pad.top + (1 - (clamp(v, yLo, yHi) - yLo) / (yHi - yLo)) * (H - pad.top - pad.bottom);
  const last = (s: string) => s.split(" ").slice(-1)[0];

  return (
    <div ref={ref} className={styles.wrap}>
      <svg width={width} height={H} role="img"
        aria-label={`Past transfers by PRPG and Def PRPG. ${demo.player} is at ${num(demo.x, 2)} and ${num(demo.y, 2)}; his comps are ${demo.comps.map((c) => c.player).join(", ")}.`}>
        {[-2, 0, 2, 4, 6].map((t) => (
          <g key={`x${t}`}>
            <text className={styles.tick} x={x(t)} y={H - pad.bottom + 16} textAnchor="middle">{t}</text>
          </g>
        ))}
        {[-1, 0, 1, 2, 3, 4, 5].map((t) => (
          <g key={`y${t}`}>
            <text className={styles.tick} x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end">{t}</text>
          </g>
        ))}
        <line className={styles.axisLine} x1={pad.left} x2={width - pad.right} y1={H - pad.bottom} y2={H - pad.bottom} />
        <line className={styles.axisLine} x1={pad.left} x2={pad.left} y1={pad.top} y2={H - pad.bottom} />
        <text className={styles.axisSub} x={(pad.left + width - pad.right) / 2} y={H - 6} textAnchor="middle">Offense PRPG</text>
        <text className={styles.axisSub} transform={`translate(12 ${(pad.top + H - pad.bottom) / 2}) rotate(-90)`} textAnchor="middle">Defense PRPG</text>
        {demo.pool.filter(([a, b]) => a >= xLo && a <= xHi && b >= yLo && b <= yHi)
          .map(([a, b], i) => <circle key={i} className={styles.poolDot} cx={x(a)} cy={y(b)} r={2.5} />)}
        {demo.comps.map((c) => <line key={c.player} className={styles.compLink} x1={x(demo.x)} y1={y(demo.y)} x2={x(c.x)} y2={y(c.y)} />)}
        {demo.comps.map((c, i) => (
          <g key={c.player}>
            <circle className={styles.compDot} cx={x(c.x)} cy={y(c.y)} r={9} />
            <text className={styles.compNum} x={x(c.x)} y={y(c.y)} dy="0.35em" textAnchor="middle">{i + 1}</text>
          </g>
        ))}
        <circle className={styles.youDot} cx={x(demo.x)} cy={y(demo.y)} r={8} />
        <text className={styles.exLabel} x={x(demo.x)} y={y(demo.y) - 14} textAnchor="middle">{width < 480 ? last(demo.player) : demo.player}</text>
      </svg>
      <p className={styles.key}>
        <span><i className={styles.keyPool} />Past transfer to a high-major</span>
        <span><i className={styles.keyYou} />{demo.player}</span>
      </p>
      <ol className={styles.compList}>
        {demo.comps.map((c, i) => (
          <li key={c.player}><span className={styles.compBadge}>{i + 1}</span><span><b>{c.player}</b><small>Moved to {c.to_team}</small></span></li>
        ))}
      </ol>
    </div>
  );
}

// The luck range drawn as what it is: the spread of an average shooter's results from luck alone. Gaps inside one
// luck range of zero (the middle of the bell) are too close to call; the tails are worse and better.
export function GapCurve() {
  const [ref, width] = useWidth<HTMLDivElement>(560);
  const H = 154, base = 112, peak = 16, lo = -3, hi = 3;
  const x = (z: number) => ((z - lo) / (hi - lo)) * width;
  const y = (z: number) => base - (base - peak) * Math.exp(-(z * z) / 2);
  const area = (a: number, b: number) => {
    const pts: string[] = [];
    for (let z = a; z <= b + 1e-9; z += 0.05) pts.push(`${x(z).toFixed(1)},${y(z).toFixed(1)}`);
    return `M${x(a)},${base} L${pts.join(" L")} L${x(b)},${base} Z`;
  };
  const curve = area(lo, hi).replace(/^M[^L]*L/, "M").replace(/ L[^L]*Z$/, "");
  const narrow = width < 420;
  return (
    <div ref={ref} className={styles.wrap}>
      <svg width={width} height={H} role="img"
        aria-label="A bell curve of what luck alone does to an average shooter. Gaps within one luck range of zero are too close to call; more than one luck range below is worse, more than one above is better.">
        <path className={styles.tailWorse} d={area(lo, -1)} />
        <path className={styles.middle} d={area(-1, 1)} />
        <path className={styles.tailBetter} d={area(1, hi)} />
        <path className={styles.bell} d={curve} />
        <line className={styles.axisLine} x1={0} x2={width} y1={base} y2={base} />
        {[-1, 0, 1].map((t) => <line key={t} className={styles.axisLine} x1={x(t)} x2={x(t)} y1={base} y2={base + 5} />)}
        <text className={styles.bellLabel} x={x(0)} y={base - 30} textAnchor="middle">Too close to call</text>
        <text className={styles.bellLabel} x={x(-2.1)} y={base - 26} textAnchor="middle">Worse</text>
        <text className={styles.bellLabel} x={x(2.1)} y={base - 26} textAnchor="middle">Better</text>
        <text className={styles.tick} x={x(-1)} y={base + 19} textAnchor="middle">{narrow ? "−Luck" : "−Luck range"}</text>
        <text className={styles.tick} x={x(0)} y={base + 19} textAnchor="middle">0</text>
        <text className={styles.tick} x={x(1)} y={base + 19} textAnchor="middle">{narrow ? "+Luck" : "+Luck range"}</text>
        <text className={styles.axisSub} x={x(0)} y={base + 36} textAnchor="middle">His FG% gap from the D1 average</text>
      </svg>
    </div>
  );
}
