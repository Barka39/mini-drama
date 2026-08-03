// Тоглуулах эрх олгогч.
//
// Хэрэглэгч анги үзэхийн өмнө энд хандана. Бид эрхийг нь СЕРВЕР ТАЛД шалгаад
// (үнэгүй хэсэгт багтсан эсвэл киног худалдаж авсан эсэх), зөвхөн тэгвэл
// хэдхэн минут хүчинтэй, гарын үсэгтэй холбоос буцаана.
//
// Ингэснээр: шууд файлын хаяг гэж байхгүй болно; хуваалцсан холбоос хэдэн
// минутын дараа үхнэ; төлөөгүй хүн төлбөртэй ангийн холбоосыг ер авч чадахгүй.
import { signPlaybackToken } from "../_lib/sign.js";

const SUPABASE_URL = "https://uloxtmssvloffbwfwzki.supabase.co";
const SUPABASE_ANON = "sb_publishable_uDORytsT_NzUAqnBXnq6Bw_Fk9o0LQ1";

// Холбоосын хүчинтэй хугацаа (секунд). Ангиас урт байх ёстой — үзэж дуустал
// хүчинтэй байхын тулд; гэхдээ хуваалцахад утгагүй болохоор богино.
const TTL = 60 * 30;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const seriesId = url.searchParams.get("series") || "";
  const ep = Number(url.searchParams.get("ep") || 0);
  const file = url.searchParams.get("file") || "";

  if (!seriesId || !ep || !file) return json({ error: "bad_request" }, 400);
  // Файлын нэр тухайн цувралынх мөн эсэх (өөр киног гуйхаас сэргийлнэ)
  if (!file.startsWith(`${seriesId}_e`) || !/^[\w.-]+\.mp4$/.test(file)) {
    return json({ error: "bad_file" }, 400);
  }

  // 1) Киноны үнэ ба үнэгүй ангийн тоог сервер талаас авна
  const metaRes = await fetch(
    `${SUPABASE_URL}/rest/v1/md_series?id=eq.${encodeURIComponent(seriesId)}&select=price,free_eps,hidden`,
    { headers: { apikey: SUPABASE_ANON } },
  );
  const metaRows = await metaRes.json();
  const meta = Array.isArray(metaRows) ? metaRows[0] : null;
  if (!meta) return json({ error: "unknown_series" }, 404);
  if (meta.hidden) return json({ error: "hidden" }, 403);

  const freeEps = Number(meta.free_eps ?? 0);
  const price = Number(meta.price ?? 0);
  const isFree = price <= 0 || ep <= freeEps;

  // 2) Төлбөртэй анги бол худалдан авалтыг шалгана
  if (!isFree) {
    const auth = request.headers.get("authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({ error: "auth_required" }, 401);

    // Хэрэглэгчийн өөрийнх нь эрхээр асууна — RLS зөвхөн түүний мөрийг буцаана
    const buyRes = await fetch(
      `${SUPABASE_URL}/rest/v1/md_purchases?series_id=eq.${encodeURIComponent(seriesId)}&status=eq.confirmed&select=id`,
      { headers: { apikey: SUPABASE_ANON, Authorization: auth } },
    );
    if (!buyRes.ok) return json({ error: "auth_failed" }, 401);
    const buys = await buyRes.json();
    if (!Array.isArray(buys) || buys.length === 0) {
      return json({ error: "not_purchased" }, 403);
    }
  }

  const exp = Math.floor(Date.now() / 1000) + TTL;
  const sig = await signPlaybackToken(env, file, exp);
  return json({ url: `/v/${file}?exp=${exp}&sig=${sig}`, exp });
}
