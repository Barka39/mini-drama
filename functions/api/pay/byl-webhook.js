// Byl-ийн «төлбөр орлоо» мэдэгдэл хүлээн авагч.
//
// Byl дэлгэрэнгүйг POST-оор илгээж, Byl-Signature толгойд HMAC-SHA256 гарын үсэг
// зурна. Гарын үсэг таарахгүй бол хэн илгээсэн нь үл хамаарна — хүлээж авахгүй.
// Таарвал захиалгыг client_reference_id (md-<дугаар>)-аар нь олж нээнэ.
//
// Byl 5 секундийн дотор 2xx хүлээдэг, эс бөгөөс ~4 хоногийн турш дахин илгээнэ.
// Бид зөвхөн нэг RPC дууддаг тул хурдан; сервер тал алдаа өгвөл 500 буцааж Byl-ийг
// дахин оролдуулна (мөнгө орсон мэдэгдлийг хэзээ ч чимээгүй алдахгүй).
import { verifyBylSignature } from "../../_lib/byl.js";

const SUPABASE_URL = "https://uloxtmssvloffbwfwzki.supabase.co";
const SUPABASE_ANON = "sb_publishable_uDORytsT_NzUAqnBXnq6Bw_Fk9o0LQ1";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export async function onRequestPost({ request, env }) {
  if (!env.BYL_WEBHOOK_SECRET || !env.BANK_HOOK_SECRET) {
    return json({ error: "not_configured" }, 503);
  }

  const raw = await request.text();
  const ok = await verifyBylSignature(
    env.BYL_WEBHOOK_SECRET,
    raw,
    request.headers.get("byl-signature"),
  );
  if (!ok) return json({ error: "bad_signature" }, 401);

  let ev;
  try {
    ev = JSON.parse(raw);
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  // Бусад төрлийн мэдэгдэл (нэхэмжлэх, захиалгат төлбөр г.м) — одоохондоо ашиглахгүй
  if (ev?.type !== "checkout.completed") return json({ ok: true, ignored: ev?.type ?? null });

  const obj = ev.data?.object ?? {};
  const ref = /^md-(\d{1,15})$/.exec(String(obj.client_reference_id ?? ""));
  // Byl-ийн самбараас гараар үүсгэсэн төлбөрийн линк г.м — манай захиалга биш
  if (!ref) return json({ ok: true, ignored: "foreign_reference" });
  if (obj.status && obj.status !== "complete") return json({ ok: true, ignored: obj.status });

  const amount = Number(obj.amount_total);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/md_confirm_by_byl`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON, "content-type": "application/json" },
    body: JSON.stringify({
      p_secret: env.BANK_HOOK_SECRET,
      p_event_id: String(ev.id),
      p_type: ev.type,
      p_purchase: Number(ref[1]),
      p_checkout: Number.isFinite(Number(obj.id)) ? Number(obj.id) : null,
      p_amount: Number.isFinite(amount) ? amount : null,
      p_raw: ev,
    }),
  });
  if (!res.ok) return json({ error: "confirm_failed", status: res.status }, 500);

  return json({ ok: true, ...(await res.json().catch(() => ({}))) });
}
