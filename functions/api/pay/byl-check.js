// QPay (Byl) төлбөрийг Byl-ээс ШУУД шалгах — webhook-ийн нөөц зам.
//
// Ердийн үед Byl «төлбөр орлоо» мэдэгдлийг (/api/pay/byl-webhook) хэдхэн секундэд
// илгээж кино өөрөө нээгддэг. Мэдэгдэл ямар нэг шалтгаанаар ирэхгүй бол төлбөр
// хүлээж буй хүний дэлгэц (эсвэл админ) энд хандаж, Byl-ээс checkout-ын төлөвийг
// асууна: «complete» бол webhook-тэй ЯГ ижил замаар (md_confirm_by_byl) нээнэ.
//
// Хэн дуудах вэ: захиалгын эзэн өөрийн JWT-ээр (RLS зөвхөн өөрийн мөрийг өгнө)
// эсвэл админ ({ purchase: <дугаар> }). Төлбөр биш зүйлийг хэзээ ч нээхгүй —
// шийдвэр нь Byl-ийн «complete» ба мөнгөн дүн дээр.
import { getCheckout } from "../../_lib/byl.js";

const SUPABASE_URL = "https://uloxtmssvloffbwfwzki.supabase.co";
const SUPABASE_ANON = "sb_publishable_uDORytsT_NzUAqnBXnq6Bw_Fk9o0LQ1";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

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

export async function onRequestPost({ request, env }) {
  if (!env.BYL_TOKEN || !env.BYL_PROJECT_ID || !env.BANK_HOOK_SECRET) {
    return json({ error: "not_configured" }, 503);
  }
  const auth = request.headers.get("authorization") || "";
  const uid = auth.startsWith("Bearer ") ? userIdFrom(auth) : null;
  if (!uid) return json({ error: "auth_required" }, 401);

  const input = await request.json().catch(() => ({}));
  const cols = "select=id,status,kind,series_id,pay_checkout_id";
  let filter;
  if (Number.isInteger(input.purchase) && input.purchase > 0) {
    // Админ (эсвэл эзэн) тодорхой захиалгыг — RLS эрхгүй бол хоосон буцаана
    filter = `id=eq.${input.purchase}`;
  } else {
    const kind = input.kind === "sub" ? "sub" : "movie";
    const series = typeof input.series === "string" ? input.series : "";
    if (kind === "movie" && !/^[\w-]{1,80}$/.test(series)) return json({ error: "bad_series" }, 400);
    filter =
      `user_id=eq.${uid}&status=eq.pending&` +
      (kind === "sub" ? "kind=eq.sub" : `kind=eq.movie&series_id=eq.${encodeURIComponent(series)}`);
  }
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/md_purchases?${filter}&${cols}&order=created_at.desc&limit=1`,
    { headers: { apikey: SUPABASE_ANON, Authorization: auth } },
  );
  const rows = res.ok ? await res.json().catch(() => []) : [];
  const buy = Array.isArray(rows) ? rows[0] : null;
  if (!buy) return json({ status: "none" });
  if (buy.status !== "pending") return json({ status: buy.status });
  if (!buy.pay_checkout_id) return json({ status: "pending", byl: null });

  const got = await getCheckout(env, buy.pay_checkout_id);
  const c = got.body?.data;
  if (!got.ok || !c) return json({ error: "byl_failed", status: got.status }, 502);
  if (c.status !== "complete") return json({ status: "pending", byl: c.status });
  // Энэ захиалгын checkout мөн эсэх (өөр захиалгын төлбөрөөр нээхгүй)
  if (String(c.client_reference_id) !== `md-${buy.id}`) return json({ error: "mismatch" }, 409);

  const amount = Number(c.amount_total);
  const conf = await fetch(`${SUPABASE_URL}/rest/v1/rpc/md_confirm_by_byl`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON, "content-type": "application/json" },
    body: JSON.stringify({
      p_secret: env.BANK_HOOK_SECRET,
      // Нэг checkout-д нэг л шалгалтын бичлэг — давтан дуудсан ч давхардахгүй
      p_event_id: `check-${c.id}`,
      p_type: "checkout.completed",
      p_purchase: buy.id,
      p_checkout: Number(c.id),
      p_amount: Number.isFinite(amount) ? amount : null,
      p_raw: { source: "check", checkout: { id: c.id, status: c.status, amount_total: c.amount_total } },
    }),
  });
  if (!conf.ok) return json({ error: "confirm_failed", status: conf.status }, 500);
  const out = await conf.json().catch(() => ({}));
  // Давтан шалгалт (duplicate) бол бодит төлөвийг клиент өөрөө дахин ачаалж мэднэ
  return json({ status: out.matched ? "confirmed" : "pending", result: out.result ?? (out.duplicate ? "duplicate" : null) });
}
