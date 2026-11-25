import { NavLink, Link } from "react-router-dom";
import styles from "./Shell.module.css";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

export function Shell({ onSearch }: { onSearch: () => void }) {
  return (
    <header className={styles.shell}>
      <div className={styles.inner}>
        <Link className={styles.brand} to="/">
          <img src={`${import.meta.env.BASE_URL}block_i.png`} alt="" width="20" height="25" />
          <span>Illinois Transfer Portal Scouting Board</span>
        </Link>
        <nav aria-label="Main" className={styles.nav}>
          <NavLink to="/" end>Board</NavLink>
          <NavLink to="/methodology">Methodology</NavLink>
        </nav>
        <button type="button" className={styles.search} onClick={onSearch} aria-keyshortcuts={isMac ? "Meta+K" : "Control+K"}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          <span>Search players</span>
          <kbd>{isMac ? "⌘K" : "Ctrl K"}</kbd>
        </button>
      </div>
    </header>
  );
}
