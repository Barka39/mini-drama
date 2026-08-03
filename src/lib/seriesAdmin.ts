// Киноны засварлах мэдээлэл сервер талд (md_series). catalog.json нь зөвхөн
// ангиудын файлын жагсаалтыг хариуцна — нэр/ангилал/үнэ энд байна.
import { useMemo, useSyncExternalStore } from "react";
import { supa } from "./supa";
import { applyOverrides, CATALOG, type Series } from "../data/catalog";

export interface SeriesMeta {
  id: string;
  title: string;
  tagline: string;
  genre: string;
  price: number;
  free_minutes: number;
  sort_order: number;
  hidden: boolean;
}

let overrides: Record<string, SeriesMeta> = {};
let loaded = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

export function useSeriesOverrides(): Record<string, SeriesMeta> {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => overrides,
  );
}

export async function loadSeriesMeta(force = false): Promise<SeriesMeta[]> {
  if (loaded && !force) return Object.values(overrides);
  const { data } = await supa
    .from("md_series")
    .select("id, title, tagline, genre, price, free_minutes, sort_order, hidden");
  const next: Record<string, SeriesMeta> = {};
  for (const row of (data ?? []) as SeriesMeta[]) {
    next[row.id] = { ...row, free_minutes: Number(row.free_minutes) };
  }
  overrides = next;
  loaded = true;
  notify();
  return Object.values(next);
}

// Сайт даяар ашиглагдах каталог: catalog.json + админы засварууд
export function useCatalog(): Series[] {
  const o = useSeriesOverrides();
  return useMemo(() => applyOverrides(CATALOG, o), [o]);
}

export function useSeriesById(id: string | undefined): Series | undefined {
  const list = useCatalog();
  return useMemo(() => (id ? list.find((s) => s.id === id) : undefined), [list, id]);
}

export async function saveSeriesMeta(m: SeriesMeta): Promise<{ ok: boolean; reason?: string }> {
  const { error } = await supa.rpc("md_update_series", {
    p_id: m.id,
    p_title: m.title,
    p_tagline: m.tagline,
    p_genre: m.genre,
    p_price: m.price,
    p_free_minutes: m.free_minutes,
    p_sort_order: m.sort_order,
    p_hidden: m.hidden,
  });
  if (error) return { ok: false, reason: error.message };
  overrides = { ...overrides, [m.id]: { ...m } };
  notify();
  return { ok: true };
}
