import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import {
  createColumnHelper, flexRender, getCoreRowModel, getSortedRowModel, useReactTable,
  type ColumnDef, type OnChangeFn, type SortingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { BoardRow, PctStat } from "../data/types";
import { height, num, ordinal, pctShown, signed } from "../lib/format";
import { heatStyle } from "../lib/heat";
import { useDarkMode } from "../lib/useDarkMode";
import { MIN_FGA, MIN_MPG } from "../lib/volume";
import styles from "./Board.module.css";

const ROW_HEIGHT = 40;
const col = createColumnHelper<BoardRow>();

const QUALIFIES: Partial<Record<PctStat, (r: BoardRow) => boolean>> = {
  ts: (r) => r.fga == null || r.fga >= MIN_FGA,
  ftr: (r) => r.fga == null || r.fga >= MIN_FGA,
  usg: (r) => r.mpg == null || r.mpg >= MIN_MPG,
  ortg: (r) => r.mpg == null || r.mpg >= MIN_MPG,
  ast: (r) => r.mpg == null || r.mpg >= MIN_MPG,
  to: (r) => r.mpg == null || r.mpg >= MIN_MPG,
};

interface Meta {
  width: number;
  align?: "left" | "right" | "center";
  sticky?: number;
  help?: string;
}

function percentileLabel(r: BoardRow, key: PctStat): string | undefined {
  const p = pctShown(r.pct[key]);
  if (p == null) return undefined;
  const label = `${ordinal(p)} percentile among ${r.pos ? `${r.pos}s` : "his position"}`;
  return key === "to" ? `${label} (higher means fewer turnovers)` : label;
}

function statColumn(key: PctStat & keyof BoardRow, header: string, digits: number, help: string, width = 64) {
  const qualifies = QUALIFIES[key];
  return col.accessor((r) => (qualifies && !qualifies(r) ? undefined : (r[key] as number | null) ?? undefined), {
    id: key,
    header,
    sortUndefined: "last",
    sortDescFirst: true,
    meta: { width, align: "right", help } satisfies Meta,
    cell: (c) => {
      const pctLabel = percentileLabel(c.row.original, key);
      return (
        <>
          {num(c.row.original[key] as number | null, digits)}
          {pctLabel && <span className="visually-hidden">, {pctLabel}</span>}
        </>
      );
    },
  });
}

function useColumns() {
  return useMemo(() => {
    return [
      col.accessor("rank", { header: "#", sortDescFirst: false, meta: { width: 52, align: "right", sticky: 0 } satisfies Meta,
        cell: (c) => <span className={styles.rank}>{c.getValue()}</span> }),
      col.accessor("player", { header: "Player", sortDescFirst: false, meta: { width: 196, align: "left", sticky: 52 } satisfies Meta,
        cell: (c) => <span className={styles.name} title={c.getValue()}>{c.getValue()}</span> }),
      col.accessor("team", { header: "Team", sortDescFirst: false, meta: { width: 180, align: "left" } satisfies Meta,
        cell: (c) => <span title={c.getValue()}>{c.getValue()}</span> }),
      col.accessor("conf", { header: "Conf", sortDescFirst: false, meta: { width: 48, align: "left" } satisfies Meta }),
      col.accessor((r) => r.exp ?? undefined, { id: "exp", header: "Class", sortUndefined: "last", meta: { width: 48, align: "left" } satisfies Meta,
        sortingFn: (a, b) => CLASS_ORDER.indexOf(a.original.exp ?? "") - CLASS_ORDER.indexOf(b.original.exp ?? ""),
        cell: (c) => c.getValue() ?? "–" }),
      col.accessor((r) => r.pos ?? undefined, { id: "pos", header: "Pos", sortUndefined: "last", meta: { width: 80, align: "left" } satisfies Meta,
        cell: (c) => c.getValue() ?? "–" }),
      col.accessor((r) => r.inches ?? undefined, { id: "inches", header: "Ht", sortUndefined: "last", sortDescFirst: true, meta: { width: 48, align: "right" } satisfies Meta,
        cell: (c) => height(c.getValue() as number | undefined) }),
      col.accessor("projected_porpag", {
        header: "Proj PRPG", sortDescFirst: true,
        meta: { width: 84, align: "right", help: "Projected PRPG at a Big Ten school." } satisfies Meta,
        cell: (c) => <b className={styles.proj}>{num(c.getValue() as number, 2)}</b>,
      }),
      statColumn("porpag", "PRPG", 2, "Points over replacement per game this season.", 68),
      col.accessor((r) => r.projected_porpag - r.porpag, {
        id: "change", header: "Change", sortDescFirst: true,
        meta: { width: 68, align: "right", help: "Projected PRPG minus his current PRPG." } satisfies Meta,
        cell: (c) => <span className={styles.change}>{signed(c.getValue() as number)}</span>,
      }),
      statColumn("dporpag", "Def PRPG", 2, "Defensive points over replacement per game.", 76),
      statColumn("usg", "USG%", 1, "Usage rate: share of team possessions he uses."),
      statColumn("ortg", "ORtg", 1, "Offensive rating: points produced per 100 possessions."),
      statColumn("ts", "TS%", 1, "True shooting percentage."),
      statColumn("ast", "AST%", 1, "Assist rate."),
      statColumn("to", "TO%", 1, "Turnover rate. Lower is better, so its shading is flipped: blue means few turnovers."),
      statColumn("ftr", "FTR", 1, "Free throw rate: free throw attempts per 100 field goal attempts."),
    ] as ColumnDef<BoardRow, unknown>[];
  }, []);
}

const CLASS_ORDER = ["Fr", "So", "Jr", "Sr", "Gr"];
const SHADED = new Set<string>(["porpag", "dporpag", "usg", "ortg", "ts", "ast", "to", "ftr"]);

function SortIcon({ dir }: { dir: false | "asc" | "desc" }) {
  if (!dir) return null;
  return (
    <svg className={styles.arrow} aria-hidden="true" width="8" height="8" viewBox="0 0 8 8">
      <path d={dir === "asc" ? "M4 1 L7.5 6.5 H0.5 Z" : "M4 7 L7.5 1.5 H0.5 Z"} fill="currentColor" />
    </svg>
  );
}

interface Props {
  rows: BoardRow[];
  openId: number | null;
  onOpen: (row: BoardRow) => void;
  sorting: SortingState;
  onSortingChange: OnChangeFn<SortingState>;
}

export function BoardTable({ rows, openId, onOpen, sorting, onSortingChange }: Props) {
  const columns = useColumns();
  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (r) => String(r.id),
  });
  const tableRows = table.getRowModel().rows;
  const dark = useDarkMode();

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  // Roving focus: one row is tabbable; arrow keys move between rows.
  const [active, setActive] = useState(0);
  const focusPending = useRef(false);
  useEffect(() => {
    if (!focusPending.current) return;
    // A far jump (End, PageDown) renders the target row only after the scroll lands; keep trying until it exists.
    const target = scrollRef.current?.querySelector<HTMLTableRowElement>(`tr[data-index="${active}"]`);
    if (target) {
      focusPending.current = false;
      target.focus({ preventScroll: true });
    }
  });
  const moveTo = (i: number) => {
    const next = Math.max(0, Math.min(tableRows.length - 1, i));
    setActive(next);
    focusPending.current = true;
    virtualizer.scrollToIndex(next, { align: "auto" });
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTableSectionElement>) => {
    const page = Math.max(1, Math.floor((scrollRef.current?.clientHeight ?? 400) / ROW_HEIGHT) - 2);
    const keys: Record<string, () => void> = {
      ArrowDown: () => moveTo(active + 1),
      ArrowUp: () => moveTo(active - 1),
      PageDown: () => moveTo(active + page),
      PageUp: () => moveTo(active - page),
      Home: () => moveTo(0),
      End: () => moveTo(tableRows.length - 1),
      Enter: () => onOpen(tableRows[active].original),
      " ": () => onOpen(tableRows[active].original),
    };
    if (keys[e.key]) {
      e.preventDefault();
      keys[e.key]();
    }
  };

  // One tooltip for the whole table, shown instantly for the stat cell under the pointer.
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  const showTip = (e: MouseEvent<HTMLTableSectionElement>) => {
    const td = (e.target as Element).closest<HTMLTableCellElement>("td[data-tip]");
    if (!td) return setTip(null);
    const box = td.getBoundingClientRect();
    setTip((t) => (t && t.text === td.dataset.tip && t.x === box.left + box.width / 2 ? t : { text: td.dataset.tip!, x: box.left + box.width / 2, y: box.top }));
  };

  const items = virtualizer.getVirtualItems();
  const padTop = items.length ? items[0].start : 0;
  const padBottom = items.length ? virtualizer.getTotalSize() - items[items.length - 1].end : 0;
  const totalWidth = columns.reduce((sum, c) => sum + ((c.meta as Meta).width ?? 80), 0);

  return (
    <div className={styles.scroll} ref={scrollRef} onScroll={() => setTip(null)}>
      <table className={styles.table} style={{ width: totalWidth }} aria-rowcount={tableRows.length + 1}>
        <colgroup>
          {columns.map((c, i) => <col key={i} style={{ width: (c.meta as Meta).width }} />)}
        </colgroup>
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} aria-rowindex={1}>
              {hg.headers.map((h) => {
                const meta = h.column.columnDef.meta as Meta;
                const sorted = h.column.getIsSorted();
                return (
                  <th
                    key={h.id}
                    scope="col"
                    aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                    className={`${styles[meta.align ?? "right"]} ${meta.sticky != null ? styles.sticky : ""}`}
                    style={meta.sticky != null ? { left: meta.sticky } : undefined}
                  >
                    <button type="button" className={styles.sort} onClick={h.column.getToggleSortingHandler()} title={meta.help}>
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      <SortIcon dir={sorted} />
                    </button>
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody onKeyDown={onKeyDown} onMouseOver={showTip} onMouseLeave={() => setTip(null)}>
          {padTop > 0 && <tr aria-hidden="true"><td colSpan={columns.length} style={{ height: padTop, padding: 0, border: 0 }} /></tr>}
          {items.map((v) => {
            const row = tableRows[v.index];
            const isOpen = row.original.id === openId;
            return (
              <tr
                key={row.id}
                data-index={v.index}
                aria-rowindex={v.index + 2}
                aria-selected={isOpen || undefined}
                tabIndex={v.index === active ? 0 : -1}
                className={`${styles.row} ${v.index % 2 ? styles.alt : ""} ${isOpen ? styles.open : ""}`}
                onClick={() => { setActive(v.index); onOpen(row.original); }}
                onFocus={() => setActive(v.index)}
              >
                {row.getVisibleCells().map((cell) => {
                  const meta = cell.column.columnDef.meta as Meta;
                  const heat = SHADED.has(cell.column.id) ? heatStyle(row.original.pct[cell.column.id as PctStat], dark) : undefined;
                  return (
                    <td
                      key={cell.id}
                      className={`${styles[meta.align ?? "right"]} ${meta.sticky != null ? styles.sticky : ""} ${heat ? styles.heat : ""}`}
                      style={meta.sticky != null ? { left: meta.sticky } : heat}
                      data-tip={SHADED.has(cell.column.id) ? percentileLabel(row.original, cell.column.id as PctStat) : undefined}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  );
                })}
              </tr>
            );
          })}
          {padBottom > 0 && <tr aria-hidden="true"><td colSpan={columns.length} style={{ height: padBottom, padding: 0, border: 0 }} /></tr>}
        </tbody>
      </table>
      {tip && (
        <div className={styles.tip} role="tooltip" style={{ left: tip.x, top: tip.y }}>{tip.text}</div>
      )}
    </div>
  );
}

export function BoardTableSkeleton() {
  return (
    <div className={styles.scroll} aria-busy="true" aria-label="Loading the board">
      <div className={styles.skelHead} />
      {Array.from({ length: 14 }, (_, i) => (
        <div key={i} className={styles.skelRow}>
          <span className="skeleton" style={{ width: 28 }} />
          <span className="skeleton" style={{ width: 150 }} />
          <span className="skeleton" style={{ width: 120 }} />
          <span className="skeleton" style={{ flex: 1 }} />
        </div>
      ))}
    </div>
  );
}
