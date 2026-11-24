import { useOutletContext } from "react-router-dom";
import type { SeasonsFile } from "./data/types";

export interface AppContext {
  seasons: SeasonsFile | null;
  season: number | null;
  error: string | null;
}

export const useApp = () => useOutletContext<AppContext>();
