import { useSyncExternalStore } from "react";

// Saved filters live in this browser's localStorage; the site has no accounts or server.
// A view is a name plus the filter and sort part of the URL, so applying one is the same as
// opening a shared link.
export interface SavedView {
  id: string;
  name: string;
  query: string;
}

const KEY = "scouting-board.saved-views";
const listeners = new Set<() => void>();
let cache: SavedView[] | null = null;

function read(): SavedView[] {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    cache = Array.isArray(parsed) ? parsed.filter((v) => v && typeof v.name === "string" && typeof v.query === "string") : [];
  } catch {
    cache = [];
  }
  return cache!;
}

function write(views: SavedView[]) {
  cache = views;
  localStorage.setItem(KEY, JSON.stringify(views));
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) { cache = null; listener(); } };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(listener); window.removeEventListener("storage", onStorage); };
}

export function useSavedViews() {
  const views = useSyncExternalStore(subscribe, read, () => []);
  return {
    views,
    save: (name: string, query: string) =>
      write([...views.filter((v) => v.name !== name), { id: crypto.randomUUID(), name, query }]),
    remove: (id: string) => write(views.filter((v) => v.id !== id)),
  };
}
