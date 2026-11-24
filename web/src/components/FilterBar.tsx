import { useId, useRef } from "react";
import type { SeasonEntry } from "../data/types";
import {
  CLASSES, POSITION_GROUPS, RANGES, activeCount, filterChips,
  type Filters, type PositionGroup, type RangeKey,
} from "../lib/filters";
import { ConferencePicker } from "./ConferencePicker";
import { RangeSlider } from "./RangeSlider";
import { SavedViews } from "./SavedViews";
import styles from "./FilterBar.module.css";

interface Props {
  seasons: SeasonEntry[];
  season: number;
  onSeason: (season: number) => void;
  filters: Filters;
  // Takes an updater so quick successive clicks each build on the latest URL state.
  // `replace` is for continuous controls (sliders), so Back skips over each step of a drag.
  onFilters: (change: (f: Filters) => Filters, opts?: { replace?: boolean }) => void;
  resultLabel: string;
  currentQuery: string;
  onApplyView: (query: string) => void;
  conferences: string[];
  midMajors: string[];
  compact: boolean;
}

const toggleIn = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

function Controls({ seasons, season, onSeason, filters, onFilters, currentQuery, onApplyView, conferences, midMajors, stacked }: Props & { stacked: boolean }) {
  const confPop = useId();
  const morePop = useId();
  const viewsPop = useId();
  const rangeCount = Object.keys(filters.ranges).length;
  const set = (patch: (f: Filters) => Partial<Filters>, opts?: { replace?: boolean }) => onFilters((f) => ({ ...f, ...patch(f) }), opts);

  const ranges = (
    <div className={styles.ranges}>
      {(Object.keys(RANGES) as RangeKey[]).map((key) => {
        const def = RANGES[key];
        const value = filters.ranges[key] ?? [def.min, def.max];
        return (
          <RangeSlider
            key={key} label={def.label} help={def.help} min={def.min} max={def.max} step={def.step} value={value} format={def.format}
            onChange={(v) => set((f) => {
              const next = { ...f.ranges };
              if (v[0] === def.min && v[1] === def.max) delete next[key];
              else next[key] = v;
              return { ranges: next };
            }, { replace: true })}
          />
        );
      })}
    </div>
  );
  const conferencePicker = <ConferencePicker available={conferences} midMajors={midMajors} selected={filters.conf} onChange={(change) => set((f) => ({ conf: change(f.conf) }))} />;

  return (
    <div className={stacked ? styles.stacked : styles.row}>
      <label className={styles.field}>
        <span className={styles.label}>Season</span>
        <select className={styles.select} value={season} onChange={(e) => onSeason(Number(e.target.value))}>
          {seasons.map((s) => <option key={s.season} value={s.season}>{s.label}</option>)}
        </select>
      </label>

      <div className={styles.field} role="group" aria-labelledby={`${confPop}-pos`}>
        <span className={styles.label} id={`${confPop}-pos`}>Position</span>
        <div className={styles.toggles}>
          {(Object.keys(POSITION_GROUPS) as PositionGroup[]).map((p) => (
            <button
              key={p} type="button" className={styles.toggle} aria-pressed={filters.pos.includes(p)}
              title={`${POSITION_GROUPS[p].label}: ${POSITION_GROUPS[p].roles.join(", ")}`}
              onClick={() => set((f) => ({ pos: toggleIn(f.pos, p) }))}
            >{p}</button>
          ))}
        </div>
      </div>

      <div className={styles.field} role="group" aria-labelledby={`${confPop}-cls`}>
        <span className={styles.label} id={`${confPop}-cls`}>Class</span>
        <div className={styles.toggles}>
          {CLASSES.map((c) => (
            <button key={c} type="button" className={styles.toggle} aria-pressed={filters.cls.includes(c)} onClick={() => set((f) => ({ cls: toggleIn(f.cls, c) }))}>{c}</button>
          ))}
        </div>
      </div>

      {stacked ? (
        <>
          <div className={styles.field}><span className={styles.label}>Conference</span>{conferencePicker}</div>
          <div className={styles.field}><span className={styles.label}>Height, minutes and usage</span>{ranges}</div>
        </>
      ) : (
        <>
          <div className={styles.field}>
            <span className={styles.label}>Conference</span>
            <button type="button" className={styles.menuButton} popoverTarget={confPop}>
              {filters.conf.length ? `${filters.conf.length} selected` : "All"}
              <Chevron />
            </button>
            <div className={styles.pop} id={confPop} popover="auto">{conferencePicker}</div>
          </div>
          <div className={styles.field}>
            <span className={styles.spacer} aria-hidden="true" />
            <button type="button" className={styles.menuButton} popoverTarget={morePop}>
              More filters{rangeCount ? ` (${rangeCount})` : ""}
              <Chevron />
            </button>
            <div className={styles.pop} id={morePop} popover="auto">{ranges}</div>
          </div>
        </>
      )}

      <div className={styles.field}>
        {stacked ? <span className={styles.label}>Saved filters</span> : <span className={styles.spacer} aria-hidden="true" />}
        {stacked ? (
          <SavedViews currentQuery={currentQuery} hasFilters={activeCount(filters) > 0} defaultName={filterChips(filters).map((c) => c.label).join("; ")} onApply={onApplyView} />
        ) : (
          <>
            <button type="button" className={styles.menuButton} popoverTarget={viewsPop}>Saved filters<Chevron /></button>
            <div className={styles.pop} id={viewsPop} popover="auto">
              <SavedViews currentQuery={currentQuery} hasFilters={activeCount(filters) > 0} defaultName={filterChips(filters).map((c) => c.label).join("; ")} onApply={onApplyView} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Chevron() {
  return (
    <svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10"><path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
  );
}

export function FilterBar(props: Props) {
  const sheet = useRef<HTMLDialogElement>(null);
  const count = activeCount(props.filters);
  if (!props.compact) return <Controls {...props} stacked={false} />;
  return (
    <>
      <button type="button" className={styles.sheetButton} onClick={() => sheet.current?.showModal()}>
        Filters{count ? ` (${count})` : ""}
      </button>
      <dialog ref={sheet} className={styles.sheet} aria-label="Filters"
        onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.close(); }}>
        <div className={styles.sheetHead}>
          <h2>Filters</h2>
          <button type="button" className={styles.sheetDone} onClick={() => sheet.current?.close()}>Show {props.resultLabel}</button>
        </div>
        <Controls {...props} stacked onApplyView={(q) => { props.onApplyView(q); sheet.current?.close(); }} />
      </dialog>
    </>
  );
}

export function ActiveFilters({ filters, onFilters, onClear }: { filters: Filters; onFilters: (change: (f: Filters) => Filters) => void; onClear: () => void }) {
  const chips = filterChips(filters);
  if (!chips.length) return null;
  return (
    <ul className={styles.chips} aria-label="Active filters">
      {chips.map((c) => (
        <li key={c.key}>
          <button type="button" className={styles.chip} onClick={() => onFilters(c.remove)} aria-label={`Remove filter: ${c.label}`}>
            {c.label}
            <svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10"><path d="M2 2l6 6M8 2L2 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </li>
      ))}
      <li><button type="button" className={styles.clearAll} onClick={onClear}>Clear all</button></li>
    </ul>
  );
}
