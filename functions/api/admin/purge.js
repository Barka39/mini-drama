// Устгасан киноны бичлэгийг R2-оос бүрмөсөн устгагч (зөвхөн админ).
//
// Эзэн админ хуудасны «Устгасан кинонууд» хэсгээс «Бичлэгийг бүрмөсөн устгах»
// дарахад энд ирнэ. Зөвхөн аль хэдийн УСТГАСАН (md_series.deleted_at) киноны
// файлыг устгана — сайтад байгаа кинонд хүрэхгүй. Үүнийг буцаах боломжгүй.
//
// Үнэгүй багцын CPU-ийн хязгаарт багтахын тулд нэг дуудлагаар нэг хэсэг
// (FILES_PER_CALL) устгаад { deleted, more } буцаана — админ хуудас дуусталаа
// дахин дууддаг.

const SUPABASE_URL = "https://uloxtmssvloffbwfwzki.supabase.co";
const SUPABASE_ANON = "sb_publishable_uDORytsT_NzUAqnBXnq6Bw_Fk9o0LQ1";
const FILES_PER_CALL = 500;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);
  const series = url.searchParams.get("series") || "";
  if (!/^[\w-]+$/.test(series)) return json({ error: "bad_series" }, 400);

  // 1) Админ эсэхийг өгөгдлийн сан өөрөө хэлнэ (дуудагчийн өөрийн эрхээр)
  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return json({ error: "auth_required" }, 401);
  const adminRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/md_is_admin`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON, Authorization: auth, "content-type": "application/json" },
    body: "{}",
  });
  if (!adminRes.ok || (await adminRes.json().catch(() => false)) !== true) {
    return json({ error: "not_admin" }, 403);
  }

  // 2) Зөвхөн устгасан кино
  const metaRes = await fetch(
    `${SUPABASE_URL}/rest/v1/md_series?id=eq.${encodeURIComponent(series)}&select=deleted_at`,
    { headers: { apikey: SUPABASE_ANON } },
  );
  const rows = await metaRes.json().catch(() => []);
  if (!Array.isArray(rows) || !rows[0]?.deleted_at) return json({ error: "not_deleted" }, 409);

  // 3) Бичлэг (HLS), хуучин ангиуд, утаснаас солисон постер — нэг хэсгээр
  for (const prefix of [`hls/${series}/`, `videos/${series}_e`, `posters/${series}-`]) {
    const listed = await env.VIDEOS.list({ prefix, limit: FILES_PER_CALL });
    const keys = (listed.objects || []).map((o) => o.key);
    if (!keys.length) continue;
    await env.VIDEOS.delete(keys);
    return json({ deleted: keys.length, more: true });
  }
  return json({ deleted: 0, more: false });
}
