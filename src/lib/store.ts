// S2: coin, нээсэн ангиуд СЕРВЕР талд (Supabase) хадгалагдана.
// Үзсэн явц (progress) хөнгөн мэдээлэл тул локал хэвээр.
import { useSyncExternalStore } from "react";
import { supa } from "./supa";

const LOCAL_KEY = "drama-demo-state-v1";

export interface AppState {
  authReady: boolean; // сервертэй холбогдож дууссан эсэх
  signedIn: boolean;
  phone: string | null;
  isAdmin: boolean;
  coins: number;
  unlocked: Record<string, number[]>; // seriesId -> нээсэн ангийн index-үүд
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
  coins: 0,
  unlocked: {},
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
  const [profRes, unlockRes] = await Promise.all([
    supa.from("md_profiles").select("phone, coins, is_admin").eq("id", userId).maybeSingle(),
    supa.from("md_unlocks").select("series_id, ep_index"),
  ]);

  const unlocked: Record<string, number[]> = {};
  for (const row of unlockRes.data ?? []) {
    (unlocked[row.series_id] ??= []).push(row.ep_index);
  }

  if (profRes.data) {
    commit({
      authReady: true,
      signedIn: true,
      phone: profRes.data.phone,
      coins: profRes.data.coins,
      isAdmin: profRes.data.is_admin,
      unlocked,
    });
  } else {
    // Бүртgel дутуу (профайл үүсээгүй) — гарган хаяна
    await supa.auth.signOut();
  }
}

supa.auth.onAuthStateChange((_event, session) => {
  if (session?.user) {
    void loadServerState(session.user.id);
  } else {
    commit({ authReady: true, signedIn: false, phone: null, isAdmin: false, coins: 0, unlocked: {} });
  }
});

export async function refreshWallet() {
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

// ---------- Анги нээх (сервер талд атомар) ----------

export type UnlockResult = "ok" | "insufficient" | "auth" | "error";

function applyUnlock(seriesId: string, eps: number[], newCoins: number) {
  const cur = new Set(state.unlocked[seriesId] ?? []);
  eps.forEach((e) => cur.add(e));
  commit({ coins: newCoins, unlocked: { ...state.unlocked, [seriesId]: [...cur] } });
}

function mapUnlockError(message: string): UnlockResult {
  if (/insufficient_coins/.test(message)) return "insufficient";
  if (/not_signed_in|JWT|jwt/.test(message)) return "auth";
  return "error";
}

export async function unlockEpisode(seriesId: string, epIndex: number): Promise<UnlockResult> {
  if (!state.signedIn) return "auth";
  const { data, error } = await supa.rpc("md_unlock_episode", {
    p_series: seriesId,
    p_ep: epIndex,
  });
  if (error) return mapUnlockError(error.message);
  applyUnlock(seriesId, [epIndex], data as number);
  return "ok";
}

export async function unlockBundle(seriesId: string, epIndexes: number[]): Promise<UnlockResult> {
  if (!state.signedIn) return "auth";
  const { data, error } = await supa.rpc("md_unlock_bundle", {
    p_series: seriesId,
    p_eps: epIndexes,
  });
  if (error) return mapUnlockError(error.message);
  applyUnlock(seriesId, epIndexes, data as number);
  return "ok";
}

export function isUnlocked(
  s: AppState,
  seriesId: string,
  epIndex: number,
  freeCount: number,
): boolean {
  if (epIndex <= freeCount) return true;
  return (s.unlocked[seriesId] ?? []).includes(epIndex);
}

// ---------- Цэнэглэлтийн хүсэлт ----------

export interface TopupRow {
  id: number;
  coins: number;
  price: number;
  status: string;
  created_at: string;
}

export async function requestTopup(coins: number): Promise<{ ok: boolean; reason?: string }> {
  const { error } = await supa.rpc("md_request_topup", { p_coins: coins });
  if (error) {
    if (/too_many_pending/.test(error.message))
      return { ok: false, reason: "Хүлээгдэж буй хүсэлт олон байна — эхнийхээ баталгаажилтыг хүлээнэ үү" };
    return { ok: false, reason: error.message };
  }
  return { ok: true };
}

export async function myTopups(): Promise<TopupRow[]> {
  const { data } = await supa
    .from("md_topups")
    .select("id, coins, price, status, created_at")
    .order("created_at", { ascending: false })
    .limit(10);
  return (data ?? []) as TopupRow[];
}

// ---------- Үзсэн явц (локал) ----------

export function setProgress(seriesId: string, epIndex: number) {
  if (state.progress[seriesId] === epIndex) return;
  const progress = { ...state.progress, [seriesId]: epIndex };
  commit({ progress });
  localStorage.setItem(LOCAL_KEY, JSON.stringify({ progress }));
}
