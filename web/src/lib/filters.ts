import type { BoardRow } from "../data/types";
import { confName } from "./conferences";
import { height } from "./format";

// Every board filter lives in the URL, so the back button and shared links restore the view.

export const POSITION_GROUPS = {
  G: { label: "Guards", roles: ["Pure PG", "Scoring PG", "Combo G", "Wing G"] },
  F: { label: "Forwards", roles: ["Wing F", "Stretch 4"] },
  C: { label: "Bigs", roles: ["PF/C", "C"] },
} as const;
export type PositionGroup = keyof typeof POSITION_GROUPS;
export const CLASSES = ["Fr", "So", "Jr", "Sr"] as const;

export const RANGES = {
  ht: { label: "Height", help: null, min: 66, max: 88, step: 1, format: (v: number) => height(v), field: (r: BoardRow) => r.inches },
  min: { label: "Minutes per game", help: null, min: 0, max: 40, step: 1, format: (v: number) => `${v}`, field: (r: BoardRow) => r.mpg },
  usg: {
    label: "Usage rate (USG%)",
    help: "Share of his team's possessions he uses while on the floor: shots, free throws and turnovers. About 20% is average; 25% or more is a primary option.",
    min: 0, max: 40, step: 1, format: (v: number) => `${v}%`, field: (r: BoardRow) => r.usg,
  },
} as const;
export type RangeKey = keyof typeof RANGES;

export interface Filters {
  pos: PositionGroup[];
  cls: string[];
  conf: string[];
  ranges: Partial<Record<RangeKey, [number, number]>>;
}

export interface SortState {
  id: string;
  desc: boolean;
}
export const DEFAULT_SORT: SortState = { id: "projected_porpag", desc: true };

const list = (v: string | null) => (v ? v.split(",").filter(Boolean) : []);

export function parseFilters(params: URLSearchParams): Filters {
  const ranges: Filters["ranges"] = {};
  for (const key of Object.keys(RANGES) as RangeKey[]) {
    const m = params.get(key)?.match(/^(\d+)-(\d+)$/);
    if (m) ranges[key] = [Number(m[1]), Number(m[2])];
  }
  return {
    pos: list(params.get("pos")).filter((p): p is PositionGroup => p in POSITION_GROUPS),
    cls: list(params.get("class")).filter((c) => (CLASSES as readonly string[]).includes(c)),
    conf: list(params.get("conf")),
    ranges,
  };
}

export function parseSort(params: URLSearchParams): SortState {
  const id = params.get("sort");
  return id ? { id, desc: params.get("dir") !== "asc" } : DEFAULT_SORT;
}

/** Writes filters (and optionally a sort) into the params, leaving season and player alone. */
export function writeFilters(params: URLSearchParams, f: Filters, sort?: SortState): URLSearchParams {
  const set = (k: string, v: string | null) => (v ? params.set(k, v) : params.delete(k));
  set("pos", f.pos.join(","));
  set("class", f.cls.join(","));
  set("conf", f.conf.join(","));
  for (const key of Object.keys(RANGES) as RangeKey[]) {
    const r = f.ranges[key];
    set(key, r ? `${r[0]}-${r[1]}` : null);
  }
  if (sort) {
    const isDefault = sort.id === DEFAULT_SORT.id && sort.desc === DEFAULT_SORT.desc;
    set("sort", isDefault ? null : sort.id);
    set("dir", isDefault || sort.desc ? null : "asc");
  }
  return params;
}

export const EMPTY_FILTERS: Filters = { pos: [], cls: [], conf: [], ranges: {} };

function groupOf(role: string | null): PositionGroup | null {
  if (!role) return null;
  for (const [group, def] of Object.entries(POSITION_GROUPS)) if ((def.roles as readonly string[]).includes(role)) return group as PositionGroup;
  return null;
}

type Check = (r: BoardRow) => boolean;

function checks(f: Filters): { key: string; test: Check }[] {
  const out: { key: string; test: Check }[] = [];
  if (f.pos.length) out.push({ key: "pos", test: (r) => f.pos.includes(groupOf(r.pos) as PositionGroup) });
  if (f.cls.length) out.push({ key: "cls", test: (r) => f.cls.includes(r.exp ?? "") });
  if (f.conf.length) out.push({ key: "conf", test: (r) => f.conf.includes(r.conf) });
  for (const [key, range] of Object.entries(f.ranges) as [RangeKey, [number, number]][]) {
    const field = RANGES[key].field;
    out.push({ key, test: (r) => { const v = field(r); return v != null && v >= range[0] && v <= range[1]; } });
  }
  return out;
}

export function applyFilters(rows: BoardRow[], f: Filters): BoardRow[] {
  const tests = checks(f);
  return tests.length ? rows.filter((r) => tests.every((t) => t.test(r))) : rows;
}

export interface Chip {
  key: string;
  label: string;
  remove: (f: Filters) => Filters;
}

export function filterChips(f: Filters): Chip[] {
  const chips: Chip[] = [];
  if (f.pos.length) chips.push({ key: "pos", label: f.pos.map((p) => POSITION_GROUPS[p].label).join(", "), remove: (x) => ({ ...x, pos: [] }) });
  if (f.cls.length) chips.push({ key: "cls", label: `Class: ${f.cls.join(", ")}`, remove: (x) => ({ ...x, cls: [] }) });
  if (f.conf.length) chips.push({
    key: "conf",
    label: f.conf.length <= 2 ? f.conf.map(confName).join(", ") : `${f.conf.length} conferences`,
    remove: (x) => ({ ...x, conf: [] }),
  });
  for (const [key, range] of Object.entries(f.ranges) as [RangeKey, [number, number]][]) {
    const def = RANGES[key];
    const [lo, hi] = range;
    // A handle left at the end of the slider is an open bound, so say so.
    const span = lo === def.min ? `up to ${def.format(hi)}` : hi === def.max ? `${def.format(lo)} or more` : `${def.format(lo)} to ${def.format(hi)}`;
    chips.push({
      key,
      label: `${def.label}: ${span}`,
      remove: (x) => { const ranges = { ...x.ranges }; delete ranges[key]; return { ...x, ranges }; },
    });
  }
  return chips;
}

/** For an empty result: the single filter whose removal brings back the most players. */
export function loosenSuggestion(rows: BoardRow[], f: Filters): { chip: Chip; count: number } | null {
  let best: { chip: Chip; count: number } | null = null;
  for (const chip of filterChips(f)) {
    const count = applyFilters(rows, chip.remove(f)).length;
    if (count > 0 && (!best || count > best.count)) best = { chip, count };
  }
  return best;
}

export const activeCount = (f: Filters) => filterChips(f).length;

