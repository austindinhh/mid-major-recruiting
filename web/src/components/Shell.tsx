import { NavLink, Link } from "react-router-dom";
import type { SeasonEntry } from "../data/types";
import styles from "./Shell.module.css";

interface Props {
  seasons: SeasonEntry[];
  season: number | null;
  onSeasonChange: (season: number) => void;
}

export function Shell({ seasons, season, onSeasonChange }: Props) {
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
        {season != null && seasons.length > 0 && (
          <label className={styles.season}>
            <span className="visually-hidden">Season</span>
            <select value={season} onChange={(e) => onSeasonChange(Number(e.target.value))}>
              {seasons.map((s) => (
                <option key={s.season} value={s.season}>{s.label}</option>
              ))}
            </select>
          </label>
        )}
      </div>
    </header>
  );
}
