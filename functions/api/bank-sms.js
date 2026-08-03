// Банкны SMS хүлээн авагч.
//
// Android утсан дээрх дамжуулагч програм банкнаас ирсэн мессежийг энэ хаяг руу
// илгээнэ. Бид дүн болон гүйлгээний утгыг задлаад, сервер талын функцэд өгнө —
// тэр нь хүлээгдэж буй захиалгатай тааруулж, таарвал киног нээнэ.
//
// Хамгаалалт: нууц түлхүүргүй хүсэлтийг хүлээж авахгүй.

const SUPABASE_URL = "https://uloxtmssvloffbwfwzki.supabase.co";
const SUPABASE_ANON = "sb_publishable_uDORytsT_NzUAqnBXnq6Bw_Fk9o0LQ1";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/** Хаан банкны мэдэгдлээс орлогын дүн ба гүйлгээний утгыг салгана */
export function parseBankSms(text) {
  if (!text) return null;
  // "ORLOGO:10,000.00MNT" — зөвхөн ОРЛОГО. Зарлагын мессежийг үл тоомсорлоно.
  const m = /ORLOGO\s*:\s*([\d,]+(?:\.\d+)?)\s*MNT/i.exec(text);
  if (!m) return null;
  const amount = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return null;

  // "Utga:xxx" — мессежийн төгсгөл хүртэл
  const u = /Utga\s*:\s*(.*)$/is.exec(text);
  const utga = u ? u[1].trim() : "";

  return { amount, utga };
}

async function handle(request, env) {
  const url = new URL(request.url);
  const secret = env.BANK_HOOK_SECRET;
  if (!secret) return json({ error: "not_configured" }, 500);

  const given = url.searchParams.get("k") || request.headers.get("x-md-secret") || "";
  if (given !== secret) return json({ error: "forbidden" }, 403);

  // Дамжуулагч програмууд янз бүрээр илгээдэг тул бүх хэлбэрийг хүлээж авна
  let text = "";
  const ctype = request.headers.get("content-type") || "";
  if (ctype.includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    text = body.text || body.message || body.msg || body.body || "";
  } else if (ctype.includes("form")) {
    const form = await request.formData();
    text = form.get("text") || form.get("message") || form.get("msg") || form.get("body") || "";
  } else {
    text = await request.text();
  }
  text = String(text || "").trim();
  if (!text) return json({ error: "empty" }, 400);

  const parsed = parseBankSms(text);
  if (!parsed) {
    // Орлогын мессеж биш (зарлага, үлдэгдэл, зар сурталчилгаа г.м) — чимээгүй өнгөрнө
    return json({ ok: true, ignored: true });
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/md_confirm_by_amount`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON, "content-type": "application/json" },
    body: JSON.stringify({
      p_secret: secret,
      p_amount: parsed.amount,
      p_raw: text.slice(0, 500),
      p_utga: parsed.utga.slice(0, 200),
    }),
  });
  if (!res.ok) return json({ error: "confirm_failed", status: res.status }, 502);

  const result = await res.json();
  return json({ ok: true, amount: parsed.amount, ...result });
}

export const onRequestPost = ({ request, env }) => handle(request, env);
// Зарим програм зөвхөн GET илгээдэг тул түүнийг ч дэмжинэ (?text=...)
export const onRequestGet = ({ request, env }) => {
  const url = new URL(request.url);
  const text = url.searchParams.get("text") || url.searchParams.get("message") || "";
  const fake = new Request(url.toString(), {
    method: "POST",
    headers: { "content-type": "application/json", "x-md-secret": request.headers.get("x-md-secret") || "" },
    body: JSON.stringify({ text }),
  });
  return handle(fake, env);
};
