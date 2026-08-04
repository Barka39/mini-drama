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
  // seriesId -> яг төлөх өвөрмөц дүн (банкнаас таних тул зарласан үнээс бага)
  payAmounts: Record<string, number>;
  vipUntil: string | null; // сарын эрх дуусах хугацаа
  subPending: boolean; // сарын эрхийн төлбөр хүлээгдэж байна
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
  payAmounts: {},
  vipUntil: null,
  subPending: false,
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
    supa.from("md_profiles").select("phone, is_admin, full_name, vip_until").eq("id", userId).maybeSingle(),
    supa.from("md_purchases").select("series_id, status, amount, kind, plan_days").eq("user_id", userId),
  ]);

  const purchased: string[] = [];
  const pendingBuys: string[] = [];
  const payAmounts: Record<string, number> = {};
  let subPending = false;
  for (const row of buyRes.data ?? []) {
    if (row.kind === "sub") {
      // Сарын эрхийн захиалга — киноны id байхгүй тул тусад нь тэмдэглэнэ
      if (row.status === "pending") {
        subPending = true;
        if (row.amount) payAmounts["__vip__"] = row.amount;
      }
      continue;
    }
    if (row.status === "confirmed") purchased.push(row.series_id);
    else if (row.status === "pending") {
      pendingBuys.push(row.series_id);
      if (row.amount) payAmounts[row.series_id] = row.amount;
    }
  }

  if (profRes.data) {
    commit({
      authReady: true,
      signedIn: true,
      phone: profRes.data.phone,
      isAdmin: profRes.data.is_admin,
      purchased,
      pendingBuys,
      payAmounts,
      vipUntil: profRes.data.vip_until ?? null,
      subPending,
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
      payAmounts: {},
      vipUntil: null,
      subPending: false,
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

export async function signUp(
  phone: string,
  password: string,
  fullName = "",
): Promise<AuthResult> {
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
    .insert({ id: data.session.user.id, phone: digits, full_name: fullName.trim() });
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
    if (/unknown_series/.test(m))
      return {
        ok: false,
        code: "unknown",
        reason: "Энэ кино худалдаанд бэлэн болоогүй байна. Түр хүлээгээд дахин оролдоно уу.",
      };
    if (/not_signed_in|JWT|jwt/.test(m)) return { ok: false, code: "auth", reason: "Эхлээд нэвтэрнэ үү" };
    return { ok: false, code: "error", reason: m };
  }
  // Сервер оноосон өвөрмөц дүнг авахын тулд дансаа шинэчилнэ
  await refreshAccount();
  if (!state.pendingBuys.includes(seriesId)) {
    commit({ pendingBuys: [...state.pendingBuys, seriesId] });
  }
  return { ok: true };
}

/** Сарын эрх идэвхтэй эсэх */
export function hasVip(s: AppState): boolean {
  return !!s.vipUntil && new Date(s.vipUntil).getTime() > Date.now();
}

// Анги үзэх эрхтэй юу: үнэгүй хэсэг, сарын эрх, эсвэл тухайн киног авсан
export function canWatch(s: AppState, series: Series, epIndex: number): boolean {
  if (epIndex <= freeEpCount(series)) return true;
  if (hasVip(s)) return true;
  return s.purchased.includes(series.id);
}

// ---------- Нэвтрэх линк (бүртгэлгүй хандалт) ----------

export interface ClaimResult {
  ok: boolean;
  seriesId?: string;
  reason?: string;
}

const CLAIM_ERRORS: Record<string, string> = {
  bad_link: "Ийм линк олдсонгүй. Хаягаа бүрэн хуулсан эсэхээ шалгана уу.",
  revoked: "Энэ линк хүчингүй болсон байна.",
  expired: "Энэ линкийн хугацаа дууссан байна.",
  used_up: "Энэ линкийг аль хэдийн ашигласан байна. Шинэ линк хүсээрэй.",
};

/** Линкээр эрх авах. Бүртгэлгүй бол нэргүй хэрэглэгчээр нэвтэрнэ. */
export async function claimAccess(token: string): Promise<ClaimResult> {
  try {
    const { data: sess } = await supa.auth.getSession();
    if (!sess.session) {
      const { error } = await supa.auth.signInAnonymously();
      if (error) return { ok: false, reason: "Холболт үүсгэж чадсангүй: " + error.message };
    }

    const { data, error } = await supa.rpc("md_claim_access", { p_token: token });
    if (error) {
      const key = Object.keys(CLAIM_ERRORS).find((k) => error.message.includes(k));
      return { ok: false, reason: key ? CLAIM_ERRORS[key] : error.message };
    }

    await refreshAccount();
    const res = data as { series_id?: string };
    return { ok: true, seriesId: res?.series_id ?? undefined };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Алдаа гарлаа" };
  }
}

// ---------- Сарын эрх ----------

export interface Plan {
  code: string;
  label: string;
  days: number;
  price: number;
}

export async function loadPlans(): Promise<Plan[]> {
  const { data } = await supa
    .from("md_plans")
    .select("code, label, days, price")
    .eq("active", true)
    .order("sort_order");
  return (data ?? []) as Plan[];
}

export async function requestSubscription(code: string): Promise<BuyResult> {
  if (!state.signedIn) return { ok: false, code: "auth", reason: "Эхлээд нэвтэрнэ үү" };
  const { error } = await supa.rpc("md_request_subscription", { p_plan: code });
  if (error) {
    if (/already_pending/.test(error.message))
      return { ok: false, code: "pending", reason: "Хүсэлт аль хэдийн илгээгдсэн" };
    return { ok: false, code: "error", reason: error.message };
  }
  await refreshAccount();
  return { ok: true };
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
