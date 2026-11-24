import { useEffect, useState } from "react";
import { Outlet, useSearchParams } from "react-router-dom";
import { Shell } from "./components/Shell";
import { loadSeasons } from "./data/load";
import type { SeasonsFile } from "./data/types";
import type { AppContext } from "./appContext";

export function App() {
  const [seasons, setSeasons] = useState<SeasonsFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();

  useEffect(() => {
    loadSeasons().then(setSeasons, (e: Error) => setError(e.message));
  }, []);

  const requested = Number(params.get("season"));
  const season = seasons
    ? seasons.seasons.some((s) => s.season === requested) ? requested : seasons.default_season
    : null;

  const changeSeason = (next: number) => {
    setParams((p) => {
      p.set("season", String(next));
      p.delete("player");
      return p;
    });
  };

  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <Shell seasons={seasons?.seasons ?? []} season={season} onSeasonChange={changeSeason} />
      <main id="main" className="page">
        <Outlet context={{ seasons, season, error } satisfies AppContext} />
      </main>
    </>
  );
}
