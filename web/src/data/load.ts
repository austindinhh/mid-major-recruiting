import { PCT_STATS, type BoardRow, type PlayerFile, type SeasonsFile, type ZoneAverages } from "./types";

const DATA = `${import.meta.env.BASE_URL}data`;
const cache = new Map<string, Promise<unknown>>();

function getJson<T>(path: string): Promise<T> {
  let hit = cache.get(path);
  if (!hit) {
    hit = fetch(`${DATA}/${path}`).then((res) => {
      if (!res.ok) throw new Error(`Couldn't load ${path} (HTTP ${res.status}).`);
      return res.json();
    });
    hit.catch(() => cache.delete(path));
    cache.set(path, hit);
  }
  return hit as Promise<T>;
}

export const loadSeasons = () => getJson<SeasonsFile>("seasons.json");

interface BoardFile {
  season: number;
  columns: string[];
  rows: unknown[][];
}

// board.json is columnar to keep it small; turn it into one object per player.
export async function loadBoard(season: number): Promise<BoardRow[]> {
  const file = await getJson<BoardFile>(`${season}/board.json`);
  const index = Object.fromEntries(file.columns.map((c, i) => [c, i]));
  return file.rows.map((r) => {
    const row: Record<string, unknown> = {};
    for (const [col, i] of Object.entries(index)) if (!col.startsWith("pct_")) row[col] = r[i];
    row.pct = Object.fromEntries(PCT_STATS.map((s) => [s, r[index[`pct_${s}`]] ?? null]));
    return row as unknown as BoardRow;
  });
}

export const loadPlayer = (season: number, id: number) =>
  getJson<PlayerFile>(`${season}/players/${id}.json`);

export const loadZoneAverages = (season: number) =>
  getJson<ZoneAverages>(`${season}/zone_averages.json`);
