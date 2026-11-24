import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { loadBoard } from "../data/load";
import type { BoardRow } from "../data/types";
import { num } from "../lib/format";
import styles from "./CommandPalette.module.css";

interface Props {
  open: boolean;
  season: number | null;
  seasonLabel: string;
  onClose: () => void;
  onPick: (row: BoardRow) => void;
}

const MAX_RESULTS = 8;
const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Player search for the selected season, opened with Ctrl+K or Cmd+K from any page.
export function CommandPalette({ open, season, seasonLabel, onClose, onPick }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [rows, setRows] = useState<{ season: number; rows: BoardRow[] } | null>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open || season == null || rows?.season === season) return;
    let live = true;
    loadBoard(season).then((r) => { if (live) setRows({ season, rows: r }); }, () => {});
    return () => { live = false; };
  }, [open, season, rows]);

  const results = useMemo(() => {
    const q = normalize(query.trim());
    if (!q || !rows) return [];
    const starts: BoardRow[] = [], contains: BoardRow[] = [];
    for (const r of rows.rows) {
      const name = normalize(r.player);
      if (name.startsWith(q) || name.split(" ").some((part) => part.startsWith(q))) starts.push(r);
      else if (name.includes(q) || normalize(r.team).includes(q)) contains.push(r);
      if (starts.length >= MAX_RESULTS) break;
    }
    return [...starts, ...contains].slice(0, MAX_RESULTS);
  }, [query, rows]);

  const pick = (r: BoardRow) => { onPick(r); onClose(); };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter" && results[active]) { e.preventDefault(); pick(results[active]); }
  };

  return (
    <dialog
      ref={ref} className={styles.palette} aria-label="Search players"
      onClose={() => { setQuery(""); setActive(0); onClose(); }}
      onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.close(); }}
    >
      <div className={styles.field}>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
        <input
          autoFocus type="text" role="combobox" aria-expanded={results.length > 0} aria-controls="palette-results"
          aria-activedescendant={results[active] ? `palette-${results[active].id}` : undefined}
          placeholder={`Search ${seasonLabel} players or teams`} value={query}
          onChange={(e) => { setQuery(e.target.value); setActive(0); }} onKeyDown={onKeyDown}
        />
        <kbd>Esc</kbd>
      </div>
      <ul id="palette-results" role="listbox" className={styles.results}>
        {results.map((r, i) => (
          <li
            key={r.id} id={`palette-${r.id}`} role="option" aria-selected={i === active}
            className={i === active ? styles.active : undefined}
            onMouseMove={() => setActive(i)} onClick={() => pick(r)}
          >
            <span className={styles.rank}>{r.rank}</span>
            <span className={styles.who}><b>{r.player}</b><span>{r.team}, {r.conf}{r.pos ? `, ${r.pos}` : ""}</span></span>
            <span className={styles.proj}>{num(r.projected_porpag, 2)}</span>
          </li>
        ))}
      </ul>
      {query.trim() && rows && results.length === 0 && (
        <p className={styles.empty}>No {seasonLabel} player or team matches "{query.trim()}". Try a last name, or switch seasons.</p>
      )}
      {!query.trim() && <p className={styles.empty}>Type a name or a team. The number on the right is projected PRPG.</p>}
    </dialog>
  );
}
