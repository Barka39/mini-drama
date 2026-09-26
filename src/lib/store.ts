// S2.5: худалдан авалтууд СЕРВЕР талд (Supabase) хадгалагдана.
// Үзсэн явц (progress) хөнгөн мэдээлэл тул локал хэвээр.
import { useSyncExternalStore } from "react";
import { supa } from "./supa";
import { CONFIG } from "../config";
import { freeEpCount, type Series } from "../data/catalog";

const LOCAL_KEY = "drama-demo-state-v1";

export interface AppState {
  authReady: boolean; // сервертэй холбогдож дууссан эсэх
  signedIn: boolean;
  // Утасны дугааргүй «зочин» (нэргүй сесс): нэг киног бүртгэлгүй QPay-ээр авсан хүн.
  // Эрх нь зөвхөн энэ төхөөрөмж/хөтчийн сесст — сарын эрхэд бүртгэл заавал.
  guest: boolean;
  phone: string | null;
  isAdmin: boolean;
  purchased: string[]; // худалдаж авсан (баталгаажсан) кинонуудын id
  pendingBuys: string[]; // хүсэлт илгээгээд хүлээгдэж буй кинонуудын id
  // seriesId -> захиалгын дүн (2026-09-26-ноос зарласан үнэтэй ижил; хуучин
  // захиалгад өвөрмөц дүн үлдсэн байж болно). Сарын эрх = "__vip__".
  payAmounts: Record<string, number>;
  vipUntil: string | null; // сарын эрх дуусах хугацаа
  subPending: boolean; // сарын эрхийн төлбөр хүлээгдэж байна
  progress: Record<string, number>; // seriesId -> хамгийн сүүлд үзсэн анги (локал)
  // seriesId -> бүтэн киноны зогссон цэг ба нийт урт (секунд, локал)
  movieTime: Record<string, { t: number; d: number }>;
  myList: string[]; // «Миний жагсаалт» — дараа үзэхээр хадгалсан кинонууд (локал)
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

function loadMovieTime(): Record<string, { t: number; d: number }> {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (raw) return JSON.parse(raw).movieTime ?? {};
  } catch {
    /* эвдэрсэн бол хоосноос эхэлнэ */
  }
  return {};
}

function loadMyList(): string[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (raw) return JSON.parse(raw).myList ?? [];
  } catch {
    /* эвдэрсэн бол хоосноос эхэлнэ */
  }
  return [];
}

function persistLocal() {
  try {
    localStorage.setItem(
      LOCAL_KEY,
      JSON.stringify({
        progress: state.progress,
        movieTime: state.movieTime,
        myList: state.myList,
      }),
    );
  } catch {
    /* хувийн горимд хадгалж чадахгүй байж болно — үзэлтэд саад болохгүй */
  }
}

let state: AppState = {
  authReady: false,
  signedIn: false,
  guest: false,
  phone: null,
  isAdmin: false,
  purchased: [],
  pendingBuys: [],
  payAmounts: {},
  vipUntil: null,
  subPending: false,
  progress: loadProgress(),
  movieTime: loadMovieTime(),
  myList: loadMyList(),
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

// ---------- Зочноос данс руу шилжүүлэх тасалбар ----------
//
// Зочин (нэргүй сесс) нэвтрэх/бүртгүүлэхэд хуучин сесс нь солигддог тул эрхээ
// нотлох арга нь ЗӨВХӨН өмнө нь авсан тасалбар. Түүнийг localStorage-д хадгална:
// шилжүүлэх дуудлага сүлжээнээс болж бүтэлгүйтвэл дараагийн ачааллаар дахин
// оролдоно (тасалбар 1 цаг хүчинтэй). Амжилттай болмогц устгана.

const TICKET_KEY = "md-guest-ticket";
// supabase-js сессээ энэ түлхүүрээр хадгалдаг (sb-<төсөл>-auth-token)
const AUTH_KEY = `sb-${new URL(CONFIG.supabaseUrl).hostname.split(".")[0]}-auth-token`;

function storedTicket(): string | null {
  try {
    const raw = localStorage.getItem(TICKET_KEY);
    if (!raw) return null;
    const t = JSON.parse(raw) as { token?: string; at?: number };
    if (!t.token || !t.at || Date.now() - t.at > 55 * 60 * 1000) {
      localStorage.removeItem(TICKET_KEY);
      return null;
    }
    return t.token;
  } catch {
    return null;
  }
}

function storeTicket(token: string) {
  try {
    localStorage.setItem(TICKET_KEY, JSON.stringify({ token, at: Date.now() }));
  } catch {
    /* хувийн горим — энэ удаагийн дуудлагаар л шилжүүлнэ */
  }
}

function clearTicket() {
  try {
    localStorage.removeItem(TICKET_KEY);
  } catch {
    /* ignore */
  }
}

/** Хөтөчид хадгалагдсан сесс байгаа эсэх (getSession() null буцаасан ч) */
function hasStoredSession(): boolean {
  try {
    return !!localStorage.getItem(AUTH_KEY);
  } catch {
    return false;
  }
}

/** Сүлжээ/серверийн түр алдаа эсэх — тэр үед сессийг ХЭЗЭЭ Ч солихгүй */
function isRetryable(err: { name?: string; status?: number; message?: string } | null): boolean {
  if (!err) return false;
  const status = err.status ?? 0;
  return (
    err.name === "AuthRetryableFetchError" ||
    status === 0 ||
    status >= 500 ||
    /fetch|network|timeout/i.test(err.message ?? "")
  );
}

// Хэрэглэгч устсан/сесс нь хүчингүй — зөвхөн энэ үед зочны сессийг шинээр солино
// (тэр хэрэглэгчийн мөрүүд аль хэдийн байхгүй тул алдах юм үгүй).
const DEAD_USER = /foreign key|sub claim|user_not_found|User from sub claim/i;

/**
 * Зочны сесс хадгалагдсан ч getSession() хоосон буцаах нь (токен сэргээх сүлжээний
 * алдаа) бий. Тэр үед шинэ сесс үүсгэвэл төлсөн кинотой зочин устана — эхлээд
 * сэргээж үзнэ. ok=false бол сүлжээний алдаа: юу ч бүү соль.
 */
async function currentSession() {
  const { data } = await supa.auth.getSession();
  if (data.session) return { ok: true as const, session: data.session };
  if (!hasStoredSession()) return { ok: true as const, session: null };
  const r = await supa.auth.refreshSession();
  if (r.data.session) return { ok: true as const, session: r.data.session };
  if (isRetryable(r.error)) return { ok: false as const, session: null };
  return { ok: true as const, session: null }; // хадгалсан сесс үхсэн
}

async function adoptStoredGuest() {
  const ticket = storedTicket();
  if (!ticket) return;
  const { error } = await supa.rpc("md_adopt_guest", { p_ticket: ticket });
  if (!error) clearTicket();
}

// Бүртгүүлэх явцад onAuthStateChange профайл үүсэхээс ӨМНӨ ачааллаж болно —
// тэр үед «профайл дутуу» гэж гаргаж хаяхгүй.
let signingUp = false;

// ---------- Серверээс дансаа ачаалах ----------

async function loadServerState(userId: string, anonymous = false, healed = false) {
  // Бүртгэл үүсэж эхлэх мөчийн төлөвийг барина (дуудлагын явцад signingUp солигдож болно)
  const creating = signingUp;
  // Өмнө нь шилжүүлж амжаагүй зочны кино байвал эхлээд шилжүүлнэ
  if (!anonymous && !creating) await adoptStoredGuest();
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
      guest: anonymous,
      phone: profRes.data.phone,
      isAdmin: profRes.data.is_admin,
      purchased,
      pendingBuys,
      payAmounts,
      vipUntil: profRes.data.vip_until ?? null,
      subPending,
    });
  } else if (anonymous) {
    // Линкээр орсон хүн: профайлыг нь СЕРВЕР талын md_claim_access үүсгэдэг.
    // Нэвтрэлт болмогц энэ функц зэрэгцээ дуудагддаг тул профайл хараахан
    // үүсээгүй байх мөч ЗАЙЛШГҮЙ бий — тэр агшинд гаргаж хаявал линкээр орсон
    // хүний сесс устаж, эрх нь санд үлдээд өөрөө нь «бүртгүүлнэ үү» гэсэн
    // түгжээтэй дэлгэц рүү унадаг байв (2026-08-28-нд илэрсэн уралдаан).
    // Тиймээс нэргүй хэрэглэгчийг хөөхгүй — нэхэмжлэл дуусмагц
    // refreshAccount() дахин ачаалж, эрхийг нь бүрэн харуулна.
    commit({
      authReady: true,
      signedIn: true,
      guest: true,
      phone: null,
      isAdmin: false,
      purchased,
      pendingBuys,
      payAmounts,
      vipUntil: null,
      subPending,
    });
  } else if (creating || signingUp || profRes.error) {
    // Бүртгэл үүсэж байгаа эсвэл сүлжээний алдаа — гаргахгүй, дараа нь дахин ачаална
    commit({ authReady: true });
  } else {
    // Утсаар бүртгүүлсэн атлаа профайл дутуу (бүртгэл дундаа тасарсан, өөр tab-д
    // үүсч байгаа г.м). Хэзээ ч гаргаж хаяхгүй — нэвтрэх дугаараас нь профайлыг
    // нөхөөд дахин ачаална (сервер зөвхөн өөрийн дугаарыг зөвшөөрдөг).
    const { data: sess } = await supa.auth.getSession();
    const digits = /^(\d{8})@minidram\.app$/.exec(sess.session?.user?.email ?? "")?.[1] ?? null;
    if (digits && !healed) {
      const { error } = await supa.from("md_profiles").insert({ id: userId, phone: digits });
      if (!error || /duplicate/i.test(error.message)) return loadServerState(userId, anonymous, true);
    }
    commit({
      authReady: true,
      signedIn: true,
      guest: false,
      phone: digits,
      isAdmin: false,
      purchased,
      pendingBuys,
      payAmounts,
      vipUntil: null,
      subPending,
    });
  }
}

supa.auth.onAuthStateChange((_event, session) => {
  if (session?.user) {
    void loadServerState(session.user.id, session.user.is_anonymous === true);
  } else {
    commit({
      authReady: true,
      signedIn: false,
      guest: false,
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
  if (data.session?.user) {
    await loadServerState(data.session.user.id, data.session.user.is_anonymous === true);
  }
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

/**
 * Зочин (нэргүй сесс) нэвтрэх/бүртгүүлэхийн ӨМНӨ тасалбар авч хадгална. Авч
 * чадахгүй бол (сүлжээ) нэвтрэлтийг ЗОГСООНО — эс бөгөөс зочны сесс солигдож,
 * төлсөн кино нь хэзээ ч олдохгүй болно.
 */
async function prepareGuestHandover(): Promise<AuthResult> {
  const cur = await currentSession();
  if (!cur.ok) return { ok: false, reason: "Сүлжээ тогтворгүй байна. Түр хүлээгээд дахин оролдоно уу." };
  if (cur.session?.user?.is_anonymous !== true) return { ok: true };
  let { data: token, error } = await supa.rpc("md_guest_ticket");
  if (error && /JWT expired/i.test(error.message)) {
    await supa.auth.refreshSession();
    ({ data: token, error } = await supa.rpc("md_guest_ticket"));
  }
  if (error || typeof token !== "string" || !token) {
    return {
      ok: false,
      reason: "Сүлжээ тасарлаа — дахин оролдоно уу. Энэ утсан дээр авсан кинонууд тань хэвээр байна.",
    };
  }
  storeTicket(token);
  return { ok: true };
}

export async function signUp(
  phone: string,
  password: string,
  fullName = "",
): Promise<AuthResult> {
  const digits = phone.replace(/\D/g, "");
  if (digits.length !== 8) return { ok: false, reason: "Утасны дугаар 8 оронтой байх ёстой" };
  const email = `${digits}@minidram.app`;

  const hand = await prepareGuestHandover();
  if (!hand.ok) return hand;
  signingUp = true;
  try {
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

    await adoptStoredGuest();
    signingUp = false;
    await loadServerState(data.session.user.id);
    return { ok: true };
  } finally {
    signingUp = false;
  }
}

export async function signIn(phone: string, password: string): Promise<AuthResult> {
  const digits = phone.replace(/\D/g, "");
  if (digits.length !== 8) return { ok: false, reason: "Утасны дугаар 8 оронтой байх ёстой" };
  const hand = await prepareGuestHandover();
  if (!hand.ok) return hand;
  const { error } = await supa.auth.signInWithPassword({
    email: `${digits}@minidram.app`,
    password,
  });
  if (error) return { ok: false, reason: mapAuthError(error.message) };
  await adoptStoredGuest();
  await refreshAccount();
  return { ok: true };
}

/**
 * Нэг кино бүртгэлгүй авахад: сессгүй бол нэргүй (зочин) сесс нээнэ. Эрх нь тэр
 * сесст хадгалагдана — хөтөч нь санаж байх хугацаанд энэ төхөөрөмж дээр нээлттэй.
 * Хадгалсан сесс байгаа ч сүлжээнээс болж сэргээж чадахгүй бол ШИНЭ сесс нээхгүй.
 */
export async function ensureSession(): Promise<AuthResult> {
  const cur = await currentSession();
  if (!cur.ok) return { ok: false, reason: "Сүлжээ тогтворгүй байна. Түр хүлээгээд дахин оролдоно уу." };
  if (cur.session) return { ok: true };
  const { error } = await supa.auth.signInAnonymously();
  if (error) {
    return {
      ok: false,
      reason: /rate limit/i.test(error.message)
        ? "Түр ачаалал ихтэй байна. Хэдэн минутын дараа дахин оролдоно уу."
        : "Холболт үүсгэж чадсангүй. Дахин оролдоно уу.",
    };
  }
  return { ok: true };
}

export async function signOut() {
  await supa.auth.signOut();
}

/** Хэрэглэгч устсан зочны сессийг шинээр солино (өөр ямар ч алдаанд солихгүй) */
async function replaceDeadGuest(): Promise<AuthResult> {
  await supa.auth.signOut({ scope: "local" }).catch(() => undefined);
  const { error } = await supa.auth.signInAnonymously();
  return error ? { ok: false, reason: "Холболт үүсгэж чадсангүй. Дахин оролдоно уу." } : { ok: true };
}

// ---------- Худалдан авалт ----------

export type BuyResult = { ok: true } | { ok: false; code: string; reason: string };

export async function requestPurchase(seriesId: string): Promise<BuyResult> {
  // state.signedIn-ийг биш сессийг шалгана: зочны сесс дөнгөж нээгдсэн бол
  // onAuthStateChange хараахан state-ийг шинэчлээгүй байж болно.
  const { data: sess } = await supa.auth.getSession();
  if (!sess.session) return { ok: false, code: "auth", reason: "Эхлээд нэвтэрнэ үү" };
  let { error } = await supa.rpc("md_request_purchase", { p_series: seriesId });
  // Токены хугацаа дууссан (утасны цаг зөрүүтэй г.м) — ИЖИЛ хэрэглэгчээр сэргээгээд дахин
  if (error && /JWT expired/i.test(error.message)) {
    await supa.auth.refreshSession();
    ({ error } = await supa.rpc("md_request_purchase", { p_series: seriesId }));
  }
  // Зочин серверт байхгүй болсон (устгагдсан) — зөвхөн тэр үед шинэ зочин
  if (error && sess.session.user.is_anonymous === true && DEAD_USER.test(error.message)) {
    const again = await replaceDeadGuest();
    if (!again.ok) return { ok: false, code: "auth", reason: again.reason ?? "Алдаа" };
    ({ error } = await supa.rpc("md_request_purchase", { p_series: seriesId }));
  }
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
  await refreshAccount();
  if (!state.pendingBuys.includes(seriesId)) {
    commit({ pendingBuys: [...state.pendingBuys, seriesId] });
  }
  return { ok: true };
}

/** Энэ киног ОДОО үзэх эрхтэй эсэх (async урсгалын дундаас шалгахад — хуучин snapshot биш) */
export function canWatchNow(seriesId: string): boolean {
  return state.purchased.includes(seriesId) || hasVip(state);
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
  // Төлбөрийн линк: төлбөр хараахан баталгаажаагүй — хэдэн секундын дараа дахин
  notPaidYet?: boolean;
}

const CLAIM_ERRORS: Record<string, string> = {
  bad_link: "Ийм линк олдсонгүй. Хаягаа бүрэн хуулсан эсэхээ шалгана уу.",
  revoked: "Энэ линк хүчингүй болсон байна.",
  expired: "Энэ линкийн хугацаа дууссан байна.",
  used_up: "Энэ линкийг аль хэдийн ашигласан байна. Шинэ линк хүсээрэй.",
  not_paid_yet: "Төлбөр баталгаажихыг хүлээж байна…",
};

/** Линкээр эрх авах. Бүртгэлгүй бол нэргүй хэрэглэгчээр нэвтэрнэ. */
export async function claimAccess(token: string): Promise<ClaimResult> {
  try {
    const cur = await currentSession();
    if (!cur.ok) return { ok: false, reason: "Сүлжээ тогтворгүй байна. Дахин оролдоно уу." };
    let anon = cur.session?.user?.is_anonymous === true;
    if (!cur.session) {
      const { error } = await supa.auth.signInAnonymously();
      if (error) return { ok: false, reason: "Холболт үүсгэж чадсангүй: " + error.message };
      anon = true;
    }

    let { data, error } = await supa.rpc("md_claim_access", { p_token: token });
    if (error && /JWT expired/i.test(error.message)) {
      await supa.auth.refreshSession();
      ({ data, error } = await supa.rpc("md_claim_access", { p_token: token }));
    }
    // Утсанд үлдсэн хуучин зочны сесс серверт байхгүй болсон (хэрэглэгч устгагдсан)
    // бол л шинэ зочин үүсгээд нэг удаа дахин. Сүлжээ г.м бусад алдаанд сессийг
    // ХЭЗЭЭ Ч хаяхгүй — зочин төлсөн кинотой байж болно.
    if (error && anon && DEAD_USER.test(error.message)) {
      const again = await replaceDeadGuest();
      if (!again.ok) return { ok: false, reason: again.reason };
      ({ data, error } = await supa.rpc("md_claim_access", { p_token: token }));
    }
    if (error) {
      if (error.message.includes("not_paid_yet")) {
        return { ok: false, notPaidYet: true, reason: CLAIM_ERRORS.not_paid_yet };
      }
      const key = Object.keys(CLAIM_ERRORS).find((k) => error.message.includes(k));
      return { ok: false, reason: key ? CLAIM_ERRORS[key] : "Холболтын алдаа. Дахин оролдоно уу." };
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
  if (!state.signedIn || state.guest)
    return { ok: false, code: "auth", reason: "Сарын эрх авахын тулд бүртгүүлнэ үү" };
  const { error } = await supa.rpc("md_request_subscription", { p_plan: code });
  if (error) {
    if (/already_pending/.test(error.message))
      return { ok: false, code: "pending", reason: "Хүсэлт аль хэдийн илгээгдсэн" };
    if (/register_required|not_signed_in/.test(error.message))
      return { ok: false, code: "auth", reason: "Сарын эрх авахын тулд бүртгүүлнэ үү" };
    return { ok: false, code: "error", reason: error.message };
  }
  await refreshAccount();
  return { ok: true };
}

// ---------- QPay (Byl) ----------

export type OnlinePayResult = { ok: true; url: string } | { ok: false; reason: string };

const ONLINE_PAY_ERRORS: Record<string, string> = {
  auth_required: "Холболт салсан байна. Хуудсаа дахин ачаалаад оролдоно уу.",
  owned: "Энэ кино танд аль хэдийн нээлттэй байна.",
  disabled: "QPay төлбөр одоогоор хаалттай байна.",
  no_pending: "Захиалга олдсонгүй. Цонхоо хаагаад дахин оролдоно уу.",
  not_configured: "QPay холболт тохируулагдаагүй байна.",
  byl_failed: "QPay түр ажиллахгүй байна. Хэдэн минутын дараа дахин оролдоно уу.",
};

/**
 * Хүлээгдэж буй захиалгын QPay төлбөрийн хуудасны хаягийг авна. Захиалга нь
 * (requestPurchase / requestSubscription-оор) аль хэдийн үүссэн байх ёстой.
 * Төлсний дараа Byl хэрэглэгчийг яг одоогийн хуудас руу нь буцаана.
 */
export async function startOnlinePay(kind: "movie" | "sub", seriesId?: string): Promise<OnlinePayResult> {
  const { data } = await supa.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, reason: ONLINE_PAY_ERRORS.auth_required };
  try {
    const res = await fetch("/api/pay/byl", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ kind, series: seriesId, back: window.location.hash || "#/" }),
    });
    const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (res.ok && body.url) return { ok: true, url: body.url };
    return {
      ok: false,
      reason: (body.error && ONLINE_PAY_ERRORS[body.error]) || "QPay холболт амжилтгүй — дансаар шилжүүлж болно",
    };
  } catch {
    return { ok: false, reason: "Сүлжээний алдаа. Дахин оролдоно уу." };
  }
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
  persistLocal();
}

/** «Миний жагсаалт»-д нэмэх / хасах */
export function toggleMyList(seriesId: string) {
  const has = state.myList.includes(seriesId);
  commit({ myList: has ? state.myList.filter((x) => x !== seriesId) : [seriesId, ...state.myList] });
  persistLocal();
}

/** Бүтэн киноны зогссон цэгийг хадгална (дараа яг тэндээс үргэлжлүүлнэ) */
export function setMovieTime(seriesId: string, t: number, d: number) {
  const prev = state.movieTime[seriesId];
  // Секунд тутамд биш — 5 секундын зөрүүтэй үед л бичнэ (утасны санах ойг хэмнэнэ)
  if (prev && Math.abs(prev.t - t) < 5 && prev.d === d) return;
  commit({ movieTime: { ...state.movieTime, [seriesId]: { t, d } } });
  persistLocal();
}
