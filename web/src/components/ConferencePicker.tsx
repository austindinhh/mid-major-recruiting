import { useMemo, useState } from "react";
import { confName } from "../lib/conferences";
import styles from "./FilterBar.module.css";

interface Props {
  available: string[];
  midMajors: string[];
  selected: string[];
  onChange: (change: (current: string[]) => string[]) => void;
}

// Conference checklist with a search box, grouped by tier. High-majors never appear on the board.
export function ConferencePicker({ available, midMajors, selected, onChange }: Props) {
  const [query, setQuery] = useState("");
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (c: string) => !q || c.toLowerCase().includes(q) || confName(c).toLowerCase().includes(q);
    const sorted = [...available].sort((a, b) => confName(a).localeCompare(confName(b)));
    return [
      { label: "Mid-majors", codes: sorted.filter((c) => midMajors.includes(c) && match(c)) },
      { label: "Low-majors", codes: sorted.filter((c) => !midMajors.includes(c) && match(c)) },
    ].filter((g) => g.codes.length);
  }, [available, midMajors, query]);

  const toggle = (code: string) =>
    onChange((cur) => (cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code]));
  const setGroup = (codes: string[], on: boolean) =>
    onChange((cur) => (on ? [...new Set([...cur, ...codes])] : cur.filter((c) => !codes.includes(c))));

  return (
    <div className={styles.confPicker}>
      <input
        type="search" className={styles.confSearch} placeholder="Search conferences" aria-label="Search conferences"
        value={query} onChange={(e) => setQuery(e.target.value)}
      />
      {groups.length === 0 && <p className={styles.muted}>{query.trim() ? `No conference matches "${query}".` : "No conferences on this board yet."}</p>}
      {groups.map((g) => {
        const allOn = g.codes.every((c) => selected.includes(c));
        return (
          <fieldset key={g.label} className={styles.confGroup}>
            <legend>
              {g.label}
              <button type="button" className={styles.linkButton} onClick={() => setGroup(g.codes, !allOn)}>
                {allOn ? "Clear" : query.trim() ? "Select shown" : "All"}
              </button>
            </legend>
            {g.codes.map((c) => (
              <label key={c} className={styles.check}>
                <input type="checkbox" checked={selected.includes(c)} onChange={() => toggle(c)} />
                <span>{confName(c)}</span>
                <span className={styles.muted}>{c}</span>
              </label>
            ))}
          </fieldset>
        );
      })}
    </div>
  );
}
