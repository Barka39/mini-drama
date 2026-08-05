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
  poster_url: string | null;
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
    .select("id, title, tagline, genre, price, free_minutes, sort_order, hidden, poster_url");
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

// Постерыг утаснаас шууд солино: зургийг багасгаад сервер рүү явуулж,
// хаягийг нь md_series-д хадгална. Сайтыг дахин гаргах шаардлагагүй.
const POSTER_MAX_W = 720;

async function shrinkImage(file: File): Promise<Blob> {
  // Утасны зураг 4-5MB байж мэднэ — картанд 540px-ээр л харагддаг тул багасгана.
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, POSTER_MAX_W / bmp.width);
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const blob = await new Promise<Blob | null>((res) =>
    canvas.toBlob(res, "image/jpeg", 0.85),
  );
  if (!blob) throw new Error("зураг боловсруулж чадсангүй");
  return blob;
}

export async function uploadPoster(
  seriesId: string,
  file: File,
): Promise<{ ok: boolean; reason?: string; url?: string }> {
  try {
    const { data: sess } = await supa.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) return { ok: false, reason: "Нэвтрээгүй байна" };

    const blob = await shrinkImage(file);
    const res = await fetch(`/api/poster?series=${encodeURIComponent(seriesId)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "image/jpeg" },
      body: blob,
    });
    const out = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!res.ok || !out.url) return { ok: false, reason: out.error || `алдаа ${res.status}` };

    const { error } = await supa.rpc("md_set_poster", { p_id: seriesId, p_url: out.url });
    if (error) return { ok: false, reason: error.message };

    const prev = overrides[seriesId];
    if (prev) {
      overrides = { ...overrides, [seriesId]: { ...prev, poster_url: out.url } };
      notify();
    }
    return { ok: true, url: out.url };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "тодорхойгүй алдаа" };
  }
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
