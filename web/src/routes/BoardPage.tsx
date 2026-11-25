import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { SortingState, Updater } from "@tanstack/react-table";
import { useApp } from "../appContext";
import { BoardList, BoardListSkeleton } from "../components/BoardList";
import { BoardTable, BoardTableSkeleton } from "../components/BoardTable";
import { ActiveFilters, FilterBar } from "../components/FilterBar";
import { HeatKey } from "../components/HeatKey";
import { InfoButton } from "../components/InfoButton";
import { PlayerDrawer } from "../components/PlayerDrawer";
import { loadBoard } from "../data/load";
import type { BoardRow } from "../data/types";
import {
  EMPTY_FILTERS, applyFilters, loosenSuggestion, parseFilters, parseSort, writeFilters,
  type Filters, type SortState,
} from "../lib/filters";
import { useMediaQuery } from "../lib/useMediaQuery";
import { MIN_FGA, MIN_MPG } from "../lib/volume";
import styles from "./BoardPage.module.css";

export function BoardPage() {
  const { seasons, season, error: seasonsError, setSeason } = useApp();
  const [board, setBoard] = useState<{ season: number; rows: BoardRow[] } | null>(null);
  const [loadError, setLoadError] = useState<{ season: number; message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [params, setParams] = useSearchParams();
  const compact = useMediaQuery("(max-width: 767px)");

  useEffect(() => {
    if (season == null) return;
    let live = true;
    loadBoard(season).then(
      (rows) => { if (live) setBoard({ season, rows }); },
      (e: Error) => { if (live) setLoadError({ season, message: e.message }); },
    );
    return () => { live = false; };
  }, [season, attempt]);

  const rows = board && board.season === season ? board.rows : null;
  const filters = useMemo(() => parseFilters(params), [params]);
  const sort = useMemo(() => parseSort(params), [params]);
  const midMajors = seasons?.mid_major_conferences ?? [];
  const conferences = useMemo(() => (rows ? [...new Set(rows.map((r) => r.conf))] : []), [rows]);

  const shown = useMemo(() => (rows ? applyFilters(rows, filters) : null), [rows, filters]);

  const openId = Number(params.get("player")) || null;
  const openRow = useMemo(() => rows?.find((r) => r.id === openId) ?? null, [rows, openId]);
  const entry = seasons?.seasons.find((s) => s.season === season);

  // Filter changes start from the browser's current URL. React Router's functional update only sees
  // the last render, so two quick clicks would otherwise drop one of them.
  const update = (change: (f: Filters) => Filters, s?: SortState, replace = false) =>
    setParams(() => {
      const p = new URLSearchParams(window.location.search);
      return writeFilters(p, change(parseFilters(p)), s);
    }, { replace });
  const onSortingChange = (u: Updater<SortingState>) => {
    const next = typeof u === "function" ? u([{ id: sort.id, desc: sort.desc }]) : u;
    update((f) => f, next[0] ? { id: next[0].id, desc: next[0].desc } : parseSort(new URLSearchParams()));
  };
  const applyView = (query: string) => setParams(() => {
    const p = new URLSearchParams(window.location.search);
    return writeFilters(p, parseFilters(new URLSearchParams(query)), parseSort(new URLSearchParams(query)));
  });
  const clearAll = () => update(() => EMPTY_FILTERS);
  const setOpen = (id: number | null) =>
    setParams((p) => {
      if (id == null) p.delete("player");
      else p.set("player", String(id));
      return p;
    }, { replace: id == null });

  const error = loadError && loadError.season === season && !rows ? loadError.message : null;
  const failure = seasonsError ?? error;
  const suggestion = rows && shown && shown.length === 0 ? loosenSuggestion(rows, filters) : null;

  return (
    <>
      <div className={`${styles.header} board-wide`}>
        <h1>{entry ? `${entry.label} Board` : "Board"}</h1>
        <InfoButton label="the board">
          <p className="def-p">Every D1 player outside the high-majors with at least {seasons?.min_games ?? 10} games, ranked by projected PRPG at a Big Ten school. Select a player for his summary.</p>
          <p className="def-p">Change is his projected PRPG minus his current PRPG.</p>
          <p className="def-p">Stat shading shows his percentile among players at his position, using the key above the table. Hover a stat for its exact percentile. TO% is flipped: blue means few turnovers. Players under {MIN_FGA} shot attempts sort last on TS% and FTR, and players under {MIN_MPG} minutes a game sort last on the other rate stats.</p>
        </InfoButton>
        {rows && shown && (
          <p className={styles.count} aria-live="polite">
            {shown.length === rows.length ? `${rows.length.toLocaleString()} players` : `${shown.length.toLocaleString()} of ${rows.length.toLocaleString()} players`}
          </p>
        )}
        {!compact && !failure && shown?.length !== 0 && <div className={styles.key}><HeatKey /></div>}
      </div>

      {seasons && season != null && (
        <div className={styles.filters}>
          <FilterBar
            seasons={seasons.seasons} season={season} onSeason={setSeason}
            filters={filters} onFilters={(change, opts) => update(change, undefined, opts?.replace)}
            resultLabel={`${(shown?.length ?? 0).toLocaleString()} ${shown?.length === 1 ? "player" : "players"}`}
            onApplyView={applyView} currentQuery={writeFilters(new URLSearchParams(), filters, sort).toString()}
            conferences={conferences} midMajors={midMajors} compact={compact}
          />
          <ActiveFilters filters={filters} onFilters={(change) => update(change)} onClear={clearAll} />
        </div>
      )}

      {failure && (
        <div className={styles.error} role="alert">
          <p>{failure}</p>
          <button type="button" onClick={() => { setLoadError(null); setAttempt((a) => a + 1); }}>Try again</button>
        </div>
      )}

      {!failure && !shown && (compact ? <BoardListSkeleton /> : <BoardTableSkeleton />)}
      {shown && shown.length === 0 && (
        <div className={styles.empty} role="status">
          <p><b>No players match these filters.</b></p>
          {suggestion && (
            <p>
              Removing <button type="button" className={styles.inlineButton} onClick={() => update(suggestion.chip.remove)}>{suggestion.chip.label}</button>{" "}
              would show {suggestion.count.toLocaleString()} {suggestion.count === 1 ? "player" : "players"}.
            </p>
          )}
          <button type="button" className={styles.clear} onClick={clearAll}>Clear all filters</button>
        </div>
      )}
      {shown && shown.length > 0 && season != null && (compact
        ? <BoardList rows={shown} openId={openId} onOpen={(r) => setOpen(r.id)} />
        : <BoardTable rows={shown} openId={openId} onOpen={(r) => setOpen(r.id)} sorting={[{ id: sort.id, desc: sort.desc }]} onSortingChange={onSortingChange} />)}

      {season != null && (
        <PlayerDrawer row={openRow} season={season} boardSize={rows?.length ?? 0} onClose={() => setOpen(null)} />
      )}
    </>
  );
}
