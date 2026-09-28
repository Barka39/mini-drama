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
  // Устгасан кино (админ): сайтаас алга, худалдан авагчид нь replaced_by руу шилжсэн.
  // purged_at = бичлэгийн файл нь бүрмөсөн устсан (сэргээх боломжгүй).
  deleted_at: string | null;
  replaced_by: string | null;
  purged_at: string | null;
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
    .select(
      "id, title, tagline, genre, price, free_minutes, sort_order, hidden, poster_url, deleted_at, replaced_by, purged_at",
    );
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

/** Устгасан киноны оронд шилжүүлсэн кино (гинжийг дагана, эргэлдэхгүй) —
 * хуучин зар, пост, ботын карт, /u/ линк шинэ кино руу орно. */
export function replacementOf(
  metas: Record<string, SeriesMeta>,
  id: string | undefined,
): string | undefined {
  let at = id;
  for (let hop = 0; at && hop < 5; hop++) {
    const next = metas[at]?.deleted_at ? metas[at]?.replaced_by : null;
    if (!next || next === id) break;
    at = next;
  }
  return at && at !== id ? at : undefined;
}

export function useReplacement(id: string | undefined): string | undefined {
  const o = useSeriesOverrides();
  return useMemo(() => replacementOf(o, id), [o, id]);
}

/** «series-260928-1940» → «2026.09.28 19:40» — ижил нэртэй хоёр киног ялгана. */
export function addedAt(id: string): string {
  const m = /^series-(\d{2})(\d{2})(\d{2})-(\d{2})(\d{2})$/.exec(id);
  return m ? `20${m[1]}.${m[2]}.${m[3]} ${m[4]}:${m[5]}` : id;
}

export interface SeriesUsage {
  buyers: number;
  pending: number;
  links: number;
}

export async function seriesUsage(id: string): Promise<SeriesUsage | null> {
  const { data, error } = await supa.rpc("md_admin_series_usage", { p_series: id });
  return error ? null : (data as SeriesUsage);
}

export async function deleteSeries(
  id: string,
  replacement: string,
): Promise<{ ok: boolean; reason?: string; moved?: SeriesUsage & { left: number } }> {
  const { data, error } = await supa.rpc("md_admin_delete_series", {
    p_series: id,
    p_replacement: replacement || null,
  });
  if (error) return { ok: false, reason: error.message };
  await loadSeriesMeta(true);
  return { ok: true, moved: data as SeriesUsage & { left: number } };
}

export async function restoreSeries(
  id: string,
): Promise<{ ok: boolean; reason?: string; back?: { purchases: number; links: number } }> {
  const { data, error } = await supa.rpc("md_admin_restore_series", { p_series: id });
  if (error) return { ok: false, reason: error.message };
  await loadSeriesMeta(true);
  return { ok: true, back: data as { purchases: number; links: number } };
}

/** Устгасан киноны бичлэгийг R2-оос бүрмөсөн устгана (functions/api/admin/purge.js),
 * хэсэг хэсгээр — дуусталаа. Буцаах боломжгүй. */
export async function purgeSeriesFiles(
  id: string,
  onProgress: (files: number) => void,
): Promise<{ ok: boolean; reason?: string; files?: number }> {
  const { data: sess } = await supa.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) return { ok: false, reason: "Нэвтрээгүй байна" };
  let files = 0;
  for (let round = 0; round < 400; round++) {
    const res = await fetch(`/api/admin/purge?series=${encodeURIComponent(id)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const out = (await res.json().catch(() => ({}))) as { deleted?: number; more?: boolean; error?: string };
    if (!res.ok) return { ok: false, reason: out.error || `алдаа ${res.status}`, files };
    files += Number(out.deleted || 0);
    onProgress(files);
    if (!out.more) break;
  }
  const { error } = await supa.rpc("md_admin_mark_purged", { p_series: id });
  if (error) return { ok: false, reason: error.message, files };
  await loadSeriesMeta(true);
  return { ok: true, files };
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
