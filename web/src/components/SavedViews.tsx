import { useState, type FormEvent } from "react";
import { useSavedViews } from "../lib/savedViews";
import styles from "./FilterBar.module.css";

interface Props {
  currentQuery: string;
  hasFilters: boolean;
  // Suggested name: a plain description of the current filters, editable before saving.
  defaultName: string;
  onApply: (query: string) => void;
}

const MAX_NAME = 80;

// Coach-made views: save the current filters under a name, apply or delete them later.
export function SavedViews({ currentQuery, hasFilters, defaultName, onApply }: Props) {
  const { views, save, remove } = useSavedViews();
  // null until the coach types, so the suggestion follows the filters as they change.
  const [edited, setEdited] = useState<string | null>(null);
  const name = edited ?? defaultName.slice(0, MAX_NAME);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || !hasFilters) return;
    save(trimmed, currentQuery);
    setEdited(null);
  };

  return (
    <div className={styles.views}>
      {views.length === 0 ? (
        <p className={styles.muted}>No saved filters yet. They're kept in this browser only.</p>
      ) : (
        <ul className={styles.viewList}>
          {views.map((v) => (
            <li key={v.id}>
              <button
                type="button" className={styles.viewItem}
                onClick={(e) => { onApply(v.query); (e.currentTarget.closest("[popover]") as HTMLElement | null)?.hidePopover(); }}
              >{v.name}</button>
              <button type="button" className={styles.viewDelete} onClick={() => remove(v.id)} aria-label={`Delete saved filters ${v.name}`}>
                <svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10"><path d="M2 2l6 6M8 2L2 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className={styles.saveForm} onSubmit={submit}>
        <label className={styles.label} htmlFor="save-view-name">Save the current filters</label>
        <div className={styles.saveRow}>
          <input
            id="save-view-name" className={styles.confSearch} value={hasFilters ? name : ""} maxLength={MAX_NAME}
            placeholder={hasFilters ? "Name these filters" : "Set a filter first"}
            disabled={!hasFilters} onChange={(e) => setEdited(e.target.value)}
          />
          <button type="submit" className={styles.saveButton} disabled={!hasFilters || !name.trim()}>
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12"><path d="M6 1.5v9M1.5 6h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
