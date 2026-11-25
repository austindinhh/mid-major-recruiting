import { useLayoutEffect, useRef, useState } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import type { BoardRow } from "../data/types";
import { className, num } from "../lib/format";
import styles from "./BoardList.module.css";

const ITEM_HEIGHT = 72;

interface Props {
  rows: BoardRow[];
  openId: number | null;
  onOpen: (row: BoardRow) => void;
}

// Phone layout: the board as a list ranked by projection.
export function BoardList({ rows, openId, onOpen }: Props) {
  const listRef = useRef<HTMLOListElement>(null);
  const [offset, setOffset] = useState(0);
  useLayoutEffect(() => setOffset(listRef.current?.offsetTop ?? 0), []);

  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => ITEM_HEIGHT,
    overscan: 8,
    scrollMargin: offset,
  });

  return (
    <>
    <div className={styles.labels} aria-hidden="true"><span>Player</span><span>Proj PRPG</span></div>
    <ol ref={listRef} className={styles.list} style={{ height: virtualizer.getTotalSize() }} aria-label="Players ranked by projected PRPG">
      {virtualizer.getVirtualItems().map((v) => {
        const r = rows[v.index];
        return (
          <li key={r.id} className={styles.item} style={{ transform: `translateY(${v.start - offset}px)` }} aria-posinset={v.index + 1} aria-setsize={rows.length}>
            <button type="button" className={`${styles.button} ${r.id === openId ? styles.open : ""}`} onClick={() => onOpen(r)}>
              <span className={styles.rank}>{r.rank}</span>
              <span className={styles.who}>
                <span className={styles.name}>{r.player}</span>
                <span className={styles.sub}>{r.team}, {r.conf}</span>
                <span className={styles.sub}>{[r.pos, r.exp && className(r.exp)].filter(Boolean).join(", ")}</span>
              </span>
              <b className={styles.proj} aria-label={`Projected PRPG ${num(r.projected_porpag, 2)}`}>{num(r.projected_porpag, 2)}</b>
            </button>
          </li>
        );
      })}
    </ol>
    </>
  );
}

export function BoardListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading the board">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className={styles.skel}>
          <span className="skeleton" style={{ width: 20 }} />
          <span className="skeleton" style={{ flex: 1 }} />
          <span className="skeleton" style={{ width: 44 }} />
        </div>
      ))}
    </div>
  );
}
