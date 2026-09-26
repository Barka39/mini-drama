// Нэвтрэх линк — эзэн чатаар илгээх, бүртгэлгүй хүн дарж үздэг.
// Линк бүр ЗӨВХӨН нэг кинотой холбогдоно.
import { supa } from "./supa";

export interface AccessLink {
  token: string;
  series_id: string | null;
  max_claims: number;
  claims: number;
  note: string;
  revoked: boolean;
  created_at: string;
}

// Сайтын хаяг: ОДОО НЭЭЖ БАЙГАА хаягаас автоматаар авна.
// Ингэснээр домэйн солигдвол (хаагдсан, эсвэл шинийг авсан) админ хуудаснаас
// үүсгэсэн линк, банкны хаяг бүгд шинэ домэйнээр автоматаар гарна — код засах
// шаардлагагүй. Сервер талд (build) VITE_SITE_URL-ээс, эс бөгөөс одоогийн хаяг.
export const SITE =
  typeof window !== "undefined" && window.location?.origin
    ? window.location.origin
    : (import.meta.env.VITE_SITE_URL ?? "https://kinomandal.com");

export function linkUrl(token: string): string {
  return `${SITE}/#/u/${token}`;
}

/** Хаягийг хүнд харуулах хэлбэр: «kinomandal.com» */
export function siteHost(): string {
  return SITE.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export async function createLinks(
  seriesId: string,
  count: number,
  maxClaims: number,
  note: string,
): Promise<{ ok: boolean; tokens?: string[]; reason?: string }> {
  const { data, error } = await supa.rpc("md_create_links", {
    p_series: seriesId,
    p_count: count,
    p_max_claims: maxClaims,
    p_note: note,
  });
  if (error) return { ok: false, reason: error.message };
  // RPC нь мөрүүд буцаадаг тул нэг талт жагсаалт болгоно
  const tokens = (data as unknown as (string | { md_create_links: string })[]).map((t) =>
    typeof t === "string" ? t : t.md_create_links,
  );
  return { ok: true, tokens };
}

export async function listLinks(seriesId?: string): Promise<AccessLink[]> {
  let q = supa
    .from("md_access_links")
    .select("token, series_id, max_claims, claims, note, revoked, created_at")
    // QPay-ийн дараа автоматаар үүсдэг төлбөрийн линкүүдийг жагсаалтад холихгүй
    .is("purchase_id", null)
    .order("created_at", { ascending: false })
    .limit(60);
  if (seriesId) q = q.eq("series_id", seriesId);
  const { data } = await q;
  return (data ?? []) as AccessLink[];
}

export async function revokeLink(token: string): Promise<boolean> {
  const { error } = await supa.rpc("md_revoke_link", { p_token: token });
  return !error;
}

/** Линкийг жагсаалтаас бүрмөсөн устгана. Аль хэдийн олгогдсон эрх хөндөгдөхгүй. */
export async function deleteLink(token: string): Promise<boolean> {
  const { error } = await supa.rpc("md_delete_link", { p_token: token });
  return !error;
}

/** Хүчингүй болгосон линкийг буцааж нээх, эсвэл дүүрсэн линкэд төхөөрөмж нэмэх. */
export async function restoreLink(token: string, addClaims = 0): Promise<boolean> {
  const { error } = await supa.rpc("md_restore_link", {
    p_token: token,
    p_add_claims: addClaims,
  });
  return !error;
}
