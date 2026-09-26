// QPay-ээр төлөх: хэрэглэгчийн хүлээгдэж буй захиалгад Byl-ийн төлбөрийн хуудас
// үүсгээд хаягийг нь буцаана. Клиент тэр хаяг руу шилжинэ.
//
// Урсгал: клиент эхлээд md_request_purchase / md_request_subscription-оор захиалга
// үүсгэнэ (дүн = зарласан үнэ; нэг кинонд зочин ч болно) → энд тэр захиалгыг ХЭРЭГЛЭГЧИЙН ӨӨРИЙНХ НЬ эрхээр (RLS)
// олно → Byl дээр хуудас үүсгэж client_reference_id = "md-<захиалгын дугаар>" гэж
// тэмдэглэнэ → төлбөр ормогц /api/pay/byl-webhook тэр дугаараар нь нээнэ.
import { createCheckout } from "../../_lib/byl.js";

const SUPABASE_URL = "https://uloxtmssvloffbwfwzki.supabase.co";
const SUPABASE_ANON = "sb_publishable_uDORytsT_NzUAqnBXnq6Bw_Fk9o0LQ1";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function rest(path, auth) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_ANON, ...(auth ? { Authorization: auth } : {}) },
  });
}

async function first(resPromise) {
  const res = await resPromise;
  if (!res.ok) return null;
  const rows = await res.json().catch(() => null);
  return Array.isArray(rows) ? (rows[0] ?? null) : null;
}

/**
 * Токен доторх хэрэглэгчийн id (sub). Гарын үсгийг энд шалгахгүй — хүсэлт бүр
 * тэр токеноор явдаг тул хуурамч бол Supabase өөрөө татгалзана. Шүүлтүүрт заавал
 * хэрэгтэй: админ RLS-ээр БҮХ хэрэглэгчийн мөрийг хардаг тул «өөрийн» мөрийг
 * id-гаар нь ялгахгүй бол өөр хүний захиалга сонгогдоно.
 */
function userIdFrom(auth) {
  try {
    const part = auth.slice(7).split(".")[1];
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)));
    return /^[0-9a-f-]{36}$/i.test(payload.sub) ? payload.sub : null;
  } catch {
    return null;
  }
}

/** Төлсний дараа буцах хаяг — зөвхөн манай сайтын дотоод зам (гадагш чиглүүлэхгүй) */
function safeBack(back) {
  const ok = (b) => typeof b === "string" && b.length < 200 && /^#\/[\w\-/?=&.%]*$/.test(b);
  if (ok(back)) return back;
  // Урт/хачин хавсралттай (fbclid г.м) бол ядаж замыг нь — нүүр хуудас биш
  const bare = typeof back === "string" ? back.split("?")[0] : "";
  return ok(bare) ? bare : "#/";
}

export async function onRequestPost({ request, env }) {
  if (!env.BYL_TOKEN || !env.BYL_PROJECT_ID || !env.BANK_HOOK_SECRET) {
    return json({ error: "not_configured" }, 503);
  }
  const auth = request.headers.get("authorization") || "";
  const uid = auth.startsWith("Bearer ") ? userIdFrom(auth) : null;
  if (!uid) return json({ error: "auth_required" }, 401);

  const input = await request.json().catch(() => ({}));
  const kind = input.kind === "sub" ? "sub" : "movie";
  const series = typeof input.series === "string" ? input.series : "";
  if (kind === "movie" && !/^[\w-]{1,80}$/.test(series)) return json({ error: "bad_series" }, 400);

  // Горим: off → хэнд ч үгүй, admin → зөвхөн админд (туршилт), on → бүгдэд
  const [settings, me] = await Promise.all([
    first(rest("md_settings?id=eq.1&select=online_pay")),
    first(rest(`md_profiles?id=eq.${uid}&select=is_admin,vip_until`, auth)),
  ]);
  if (!me) return json({ error: "auth_required" }, 401);
  const mode = settings?.online_pay ?? "off";
  if (mode === "off" || (mode === "admin" && !me.is_admin)) {
    return json({ error: "disabled" }, 403);
  }

  // Аль хэдийн үзэх эрхтэй бол (кино нь нээлттэй / сарын эрх идэвхтэй) дахин
  // төлүүлэхгүй — давхар төлбөрийг гараар буцаах шаардлагагүй болгоно.
  if (kind === "movie") {
    const vip = me.vip_until && new Date(me.vip_until).getTime() > Date.now();
    const owned = vip || (await first(rest(
      `md_purchases?user_id=eq.${uid}&series_id=eq.${encodeURIComponent(series)}&status=eq.confirmed&select=id&limit=1`,
      auth,
    )));
    if (owned) return json({ error: "owned" }, 409);
  }

  // Хэрэглэгчийн ӨӨРИЙН хүлээгдэж буй захиалга
  const filter =
    `user_id=eq.${uid}&` +
    (kind === "sub" ? "kind=eq.sub" : `kind=eq.movie&series_id=eq.${encodeURIComponent(series)}`);
  const buy = await first(
    rest(
      `md_purchases?${filter}&status=eq.pending&select=id,amount,kind,series_id,plan_code,pay_url,pay_at&order=created_at.desc&limit=1`,
      auth,
    ),
  );
  if (!buy) return json({ error: "no_pending" }, 404);
  // Саяхан (20 минутын дотор) үүсгэсэн хуудас байвал түүнийгээ — давхар дарахад
  // хоёр хуудас үүсгэхгүй. Хуучин хуудасны хугацаа дууссан байж болох тул шинийг
  // үүсгэнэ (аль хуудсаар төлсөн ч ижил захиалгын дугаартай тул нээгдэнэ).
  const fresh = buy.pay_at && Date.now() - new Date(buy.pay_at).getTime() < 20 * 60 * 1000;
  if (buy.pay_url && fresh) return json({ url: buy.pay_url, reused: true });

  let name = "Кино Мандал";
  if (kind === "sub") {
    const plan = await first(rest(`md_plans?code=eq.${encodeURIComponent(buy.plan_code ?? "")}&select=label`));
    name = `Кино Мандал — ${plan?.label ?? "сарын эрх"}`;
  } else {
    const s = await first(rest(`md_series?id=eq.${encodeURIComponent(series)}&select=title`));
    const title = s?.title || (typeof input.title === "string" ? input.title.slice(0, 120) : "");
    name = title ? `Кино: ${title}` : "Кино Мандал — кино";
  }

  const origin = new URL(request.url).origin;
  const back = `${origin}/${safeBack(input.back)}`;
  // Кино: төлсний дараа нэг удаагийн линк рүү буцна. Төлбөр баталгаажмагц тэр
  // линк кино нээнэ — QPay/банкны апп өөр хөтөч нээсэн ч (Facebook-ийн дотоод
  // хөтөч → Chrome г.м) кино тэнд нээгдэнэ. Линк үүсэхгүй бол энгийн буцах хаяг.
  let success = back;
  if (kind === "movie") {
    const link = await fetch(`${SUPABASE_URL}/rest/v1/rpc/md_create_pay_link`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON, "content-type": "application/json" },
      body: JSON.stringify({ p_secret: env.BANK_HOOK_SECRET, p_purchase: buy.id }),
    });
    const token = link.ok ? await link.json().catch(() => null) : null;
    if (typeof token === "string" && /^[0-9a-f]{32}$/.test(token)) success = `${origin}/#/u/${token}`;
  }
  const created = await createCheckout(env, {
    items: [
      {
        price_data: {
          unit_amount: buy.amount,
          product_data: {
            name: name.slice(0, 255),
            client_reference_id: kind === "sub" ? `plan-${buy.plan_code}` : series,
          },
        },
        quantity: 1,
      },
    ],
    client_reference_id: `md-${buy.id}`,
    success_url: success,
    cancel_url: back,
    // Манай хэрэглэгчид ихэвчлэн имэйлгүй — нэхэхгүй
    email_collection: false,
  });
  const checkout = created.body?.data;
  if (!created.ok || !checkout?.url) {
    return json(
      {
        error: "byl_failed",
        status: created.status,
        detail: created.body?.error ?? created.body?.message ?? null,
      },
      502,
    );
  }

  // Захиалгад холбоно. Зэрэг хоёр удаа дарсан бол эхэнд холбогдсон хуудас нь үлдэнэ.
  const att = await fetch(`${SUPABASE_URL}/rest/v1/rpc/md_attach_checkout`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON, "content-type": "application/json" },
    body: JSON.stringify({
      p_secret: env.BANK_HOOK_SECRET,
      p_purchase: buy.id,
      p_checkout: checkout.id,
      p_url: checkout.url,
    }),
  });
  const stored = att.ok ? await att.json().catch(() => null) : null;
  return json({ url: typeof stored === "string" && stored ? stored : checkout.url });
}
