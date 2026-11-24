import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useApp } from "../appContext";
import { BoardList, BoardListSkeleton } from "../components/BoardList";
import { BoardTable, BoardTableSkeleton } from "../components/BoardTable";
import { HeatKey } from "../components/HeatKey";
import { InfoButton } from "../components/InfoButton";
import { PlayerDrawer } from "../components/PlayerDrawer";
import { loadBoard } from "../data/load";
import type { BoardRow } from "../data/types";
import { useMediaQuery } from "../lib/useMediaQuery";
import { MIN_FGA, MIN_MPG } from "../lib/volume";
import styles from "./BoardPage.module.css";

export function BoardPage() {
  const { seasons, season, error: seasonsError } = useApp();
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
  const openId = Number(params.get("player")) || null;
  const openRow = useMemo(() => rows?.find((r) => r.id === openId) ?? null, [rows, openId]);
  const entry = seasons?.seasons.find((s) => s.season === season);

  const setOpen = (id: number | null) =>
    setParams((p) => {
      if (id == null) p.delete("player");
      else p.set("player", String(id));
      return p;
    }, { replace: id == null });

  const error = loadError && loadError.season === season && !rows ? loadError.message : null;
  const failure = seasonsError ?? error;

  return (
    <>
      <div className={`${styles.header} board-wide`}>
        <h1>{entry ? `${entry.label} Board` : "Board"}</h1>
        <InfoButton label="the board">
          <p className="def-p">Every D1 player outside the high-majors with at least {seasons?.min_games ?? 10} games, ranked by projected PRPG at a Big Ten school. Select a player for his summary.</p>
          <p className="def-p">Change is his projected PRPG minus his current PRPG.</p>
          <p className="def-p">Stat shading shows his percentile among players at his position, using the key above the table. Hover a stat for its exact percentile. TO% is flipped: blue means few turnovers. Players under {MIN_FGA} shot attempts sort last on TS% and FTR, and players under {MIN_MPG} minutes a game sort last on the other rate stats.</p>
        </InfoButton>
        {rows && <p className={styles.count}>{rows.length.toLocaleString()} players</p>}
        {!compact && !failure && <div className={styles.key}><HeatKey /></div>}
      </div>

      {failure && (
        <div className={styles.error} role="alert">
          <p>{failure}</p>
          <button type="button" onClick={() => { setLoadError(null); setAttempt((a) => a + 1); }}>Try again</button>
        </div>
      )}

      {!failure && !rows && (compact ? <BoardListSkeleton /> : <BoardTableSkeleton />)}
      {rows && season != null && (compact
        ? <BoardList rows={rows} openId={openId} onOpen={(r) => setOpen(r.id)} />
        : <BoardTable rows={rows} openId={openId} onOpen={(r) => setOpen(r.id)} />)}

      {season != null && (
        <PlayerDrawer row={openRow} season={season} boardSize={rows?.length ?? 0} onClose={() => setOpen(null)} />
      )}
    </>
  );
}
