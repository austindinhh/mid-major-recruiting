import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { CommandPalette } from "./components/CommandPalette";
import { Shell } from "./components/Shell";
import { loadSeasons } from "./data/load";
import type { SeasonsFile } from "./data/types";
import type { AppContext } from "./appContext";

export function App() {
  const [seasons, setSeasons] = useState<SeasonsFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    loadSeasons().then(setSeasons, (e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearching(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const requested = Number(params.get("season"));
  const season = seasons
    ? seasons.seasons.some((s) => s.season === requested) ? requested : seasons.default_season
    : null;
  const seasonLabel = seasons?.seasons.find((s) => s.season === season)?.label ?? "";

  const setSeason = (next: number) => {
    setParams((p) => {
      p.set("season", String(next));
      p.delete("player");
      return p;
    });
  };

  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <Shell onSearch={() => setSearching(true)} />
      <main id="main" className="page">
        <Outlet context={{ seasons, season, error, setSeason } satisfies AppContext} />
      </main>
      <CommandPalette
        open={searching} season={season} seasonLabel={seasonLabel} onClose={() => setSearching(false)}
        onPick={(r) => {
          // On the board, keep the current filters and just open the player.
          if (location.pathname === "/") setParams((p) => { p.set("player", String(r.id)); return p; });
          else navigate(`/?season=${season}&player=${r.id}`);
        }}
      />
    </>
  );
}
