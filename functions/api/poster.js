// Постерын зураг хүлээн авагч (зөвхөн админ).
//
// Эзэн админ хуудаснаас утасныхаа зургийн сангаас постер сонгоход энд ирнэ.
// Зураг R2 санд ордог тул сайтыг дахин гаргах (deploy) шаардлагагүй — шууд солигдоно.
// Хаягийг нь клиент дараа нь md_set_poster RPC-ээр md_series-д хадгална.

const SUPABASE_URL = "https://uloxtmssvloffbwfwzki.supabase.co";
const SUPABASE_ANON = "sb_publishable_uDORytsT_NzUAqnBXnq6Bw_Fk9o0LQ1";

// Утаснаас ирэх зураг том байж болзошгүй тул тааз тавина (клиент нь бас багасгадаг)
const MAX_BYTES = 4 * 1024 * 1024;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);
  const seriesId = url.searchParams.get("series") || "";
  if (!/^[\w-]+$/.test(seriesId)) return json({ error: "bad_series" }, 400);

  // 1) Хэн болохыг нь шалгана — админ эсэхийг СЕРВЕР талд асууна.
  //    Хэрэглэгчийн өөрийнх нь эрхээр асуух тул RLS зөвхөн түүний мөрийг өгнө.
  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return json({ error: "auth_required" }, 401);
  const meRes = await fetch(`${SUPABASE_URL}/rest/v1/md_profiles?select=is_admin`, {
    headers: { apikey: SUPABASE_ANON, Authorization: auth },
  });
  const me = await meRes.json();
  if (!Array.isArray(me) || !me[0]?.is_admin) return json({ error: "not_admin" }, 403);

  // 2) Зураг мөн эсэх, хэмжээ нь багтаж байгаа эсэх
  const type = (request.headers.get("content-type") || "").split(";")[0].trim();
  if (type !== "image/jpeg" && type !== "image/png") return json({ error: "bad_type" }, 400);
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength) return json({ error: "empty" }, 400);
  if (bytes.byteLength > MAX_BYTES) return json({ error: "too_big" }, 413);

  // 3) R2 руу. Нэр бүрд санамсаргүй сүүл — хуучин зураг браузерын кэшэд
  //    үлдэж, шинэ постер гарахгүй байх асуудлаас сэргийлнэ.
  const ext = type === "image/png" ? "png" : "jpg";
  const name = `${seriesId}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.${ext}`;
  await env.VIDEOS.put(`posters/${name}`, bytes, { httpMetadata: { contentType: type } });

  return json({ url: `/p/${name}` });
}
