// S2.5: худалдан авалтууд СЕРВЕР талд (Supabase) хадгалагдана.
// Үзсэн явц (progress) хөнгөн мэдээлэл тул локал хэвээр.
import { useSyncExternalStore } from "react";
import { supa } from "./supa";
import { freeEpCount, type Series } from "../data/catalog";

const LOCAL_KEY = "drama-demo-state-v1";

export interface AppState {
  authReady: boolean; // сервертэй холбогдож дууссан эсэх
  signedIn: boolean;
  phone: string | null;
  isAdmin: boolean;
  purchased: string[]; // худалдаж авсан (баталгаажсан) кинонуудын id
  pendingBuys: string[]; // хүсэлт илгээгээд хүлээгдэж буй кинонуудын id
  progress: Record<string, number>; // seriesId -> хамгийн сүүлд үзсэн анги (локал)
}

function loadProgress(): Record<string, number> {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (raw) return JSON.parse(raw).progress ?? {};
  } catch {
    /* эвдэрсэн бол хоосноос эхэлнэ */
  }
  return {};
}

let state: AppState = {
  authReady: false,
  signedIn: false,
  phone: null,
  isAdmin: false,
  purchased: [],
  pendingBuys: [],
  progress: loadProgress(),
};

const listeners = new Set<() => void>();

function commit(next: Partial<AppState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

export function useAppState(): AppState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}

// ---------- Серверээс дансаа ачаалах ----------

async function loadServerState(userId: string) {
  const [profRes, buyRes] = await Promise.all([
    supa.from("md_profiles").select("phone, is_admin").eq("id", userId).maybeSingle(),
    supa.from("md_purchases").select("series_id, status").eq("user_id", userId),
  ]);

  const purchased: string[] = [];
  const pendingBuys: string[] = [];
  for (const row of buyRes.data ?? []) {
    if (row.status === "confirmed") purchased.push(row.series_id);
    else if (row.status === "pending") pendingBuys.push(row.series_id);
  }

  if (profRes.data) {
    commit({
      authReady: true,
      signedIn: true,
      phone: profRes.data.phone,
      isAdmin: profRes.data.is_admin,
      purchased,
      pendingBuys,
    });
  } else {
    // Бүртгэл дутуу (профайл үүсээгүй) — гарган хаяна
    await supa.auth.signOut();
  }
}

supa.auth.onAuthStateChange((_event, session) => {
  if (session?.user) {
    void loadServerState(session.user.id);
  } else {
    commit({
      authReady: true,
      signedIn: false,
      phone: null,
      isAdmin: false,
      purchased: [],
      pendingBuys: [],
    });
  }
});

export async function refreshAccount() {
  const { data } = await supa.auth.getSession();
  if (data.session?.user) await loadServerState(data.session.user.id);
}

// ---------- Нэвтрэлт ----------

export type AuthResult = { ok: true } | { ok: false; reason: string };

function mapAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) return "Утас эсвэл нууц үг буруу байна";
  if (/already registered/i.test(message)) return "Энэ дугаар бүртгэлтэй байна — «Нэвтрэх»-ийг сонгоно уу";
  if (/at least 6/i.test(message)) return "Нууц үг дор хаяж 6 тэмдэгт байх ёстой";
  if (/confirm/i.test(message)) return "Имэйл баталгаажуулалт асаалттай байна (эзэн Dashboard-оос унтраах ёстой)";
  return message;
}

export async function signUp(phone: string, password: string): Promise<AuthResult> {
  const digits = phone.replace(/\D/g, "");
  if (digits.length !== 8) return { ok: false, reason: "Утасны дугаар 8 оронтой байх ёстой" };
  const email = `${digits}@minidram.app`;

  const { data, error } = await supa.auth.signUp({ email, password });
  if (error) return { ok: false, reason: mapAuthError(error.message) };
  if (!data.session) {
    return { ok: false, reason: "Имэйл баталгаажуулалт асаалттай байна (эзэн Dashboard-оос унтраах ёстой)" };
  }

  const { error: profErr } = await supa
    .from("md_profiles")
    .insert({ id: data.session.user.id, phone: digits });
  if (profErr && !/duplicate/i.test(profErr.message)) {
    return { ok: false, reason: "Профайл үүсгэхэд алдаа: " + profErr.message };
  }

  await loadServerState(data.session.user.id);
  return { ok: true };
}

export async function signIn(phone: string, password: string): Promise<AuthResult> {
  const digits = phone.replace(/\D/g, "");
  if (digits.length !== 8) return { ok: false, reason: "Утасны дугаар 8 оронтой байх ёстой" };
  const { error } = await supa.auth.signInWithPassword({
    email: `${digits}@minidram.app`,
    password,
  });
  if (error) return { ok: false, reason: mapAuthError(error.message) };
  return { ok: true };
}

export async function signOut() {
  await supa.auth.signOut();
}

// ---------- Худалдан авалт ----------

export type BuyResult = { ok: true } | { ok: false; code: string; reason: string };

export async function requestPurchase(seriesId: string): Promise<BuyResult> {
  if (!state.signedIn) return { ok: false, code: "auth", reason: "Эхлээд нэвтэрнэ үү" };
  const { error } = await supa.rpc("md_request_purchase", { p_series: seriesId });
  if (error) {
    const m = error.message;
    if (/already_owned/.test(m)) {
      await refreshAccount();
      return { ok: false, code: "owned", reason: "Энэ кино танд аль хэдийн нээлттэй байна" };
    }
    if (/already_pending/.test(m))
      return { ok: false, code: "pending", reason: "Хүсэлт аль хэдийн илгээгдсэн — баталгаажилтыг хүлээнэ үү" };
    if (/too_many_pending/.test(m))
      return { ok: false, code: "limit", reason: "Хүлээгдэж буй хүсэлт олон байна" };
    if (/not_signed_in|JWT|jwt/.test(m)) return { ok: false, code: "auth", reason: "Эхлээд нэвтэрнэ үү" };
    return { ok: false, code: "error", reason: m };
  }
  if (!state.pendingBuys.includes(seriesId)) {
    commit({ pendingBuys: [...state.pendingBuys, seriesId] });
  }
  return { ok: true };
}

// Анги үзэх эрхтэй юу: үнэгүй хэсэгт багтсан эсвэл киног худалдаж авсан
export function canWatch(s: AppState, series: Series, epIndex: number): boolean {
  if (epIndex <= freeEpCount(series)) return true;
  return s.purchased.includes(series.id);
}

export function buyStatus(s: AppState, seriesId: string): "owned" | "pending" | "none" {
  if (s.purchased.includes(seriesId)) return "owned";
  if (s.pendingBuys.includes(seriesId)) return "pending";
  return "none";
}

// ---------- Үзсэн явц (локал) ----------

export function setProgress(seriesId: string, epIndex: number) {
  if (state.progress[seriesId] === epIndex) return;
  const progress = { ...state.progress, [seriesId]: epIndex };
  commit({ progress });
  localStorage.setItem(LOCAL_KEY, JSON.stringify({ progress }));
}
