// Byl (byl.mn) — QPay-ээр төлбөр авах үйлчилгээ.
//
// Мөнгө Byl-ээр дамжихгүй: Byl эзний нэр дээр QPay мерчант үүсгэсэн тул QPay
// төлбөрийг шууд эзний данс руу хийнэ. Бид зөвхөн (1) төлбөрийн хуудас үүсгэж,
// (2) «төлбөр орлоо» мэдэгдлийн гарын үсгийг шалгана.
//
// Нууцууд Pages-ийн орчны хувьсагчид: BYL_TOKEN, BYL_PROJECT_ID, BYL_WEBHOOK_SECRET.

const BYL_API = "https://byl.mn/api/v1";

function toHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hmacSha256Hex(secret, text) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text)));
}

/** Тогтмол хугацааны харьцуулалт (цагийн зөрүүгээр таамаглахаас сэргийлнэ) */
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Byl-Signature толгой = HMAC-SHA256(ИРСЭН ЯГ ТЭР бие, нууц) — hex.
 * Биеийг JSON болгож буцааж бичвэл түлхүүрийн дараалал өөрчлөгдөж гарын үсэг
 * таарахгүй тул заавал түүхий текстээр нь шалгана.
 */
export async function verifyBylSignature(secret, rawBody, header) {
  if (!secret || !header) return false;
  const expected = await hmacSha256Hex(secret, rawBody);
  return safeEqual(expected, String(header).trim().toLowerCase());
}

/** Төлбөрийн хуудас (checkout) үүсгэнэ. Хариу: { ok, status, body } */
export async function createCheckout(env, payload) {
  const res = await fetch(`${BYL_API}/projects/${env.BYL_PROJECT_ID}/checkouts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.BYL_TOKEN}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

/** Checkout-ын одоогийн төлөв (open | pending | complete | expired). Хариу: { ok, status, body } */
export async function getCheckout(env, checkoutId) {
  const res = await fetch(`${BYL_API}/projects/${env.BYL_PROJECT_ID}/checkouts/${checkoutId}`, {
    headers: { Authorization: `Bearer ${env.BYL_TOKEN}`, Accept: "application/json" },
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}
