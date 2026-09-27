// /u/<токен> — эзний чатаар явуулдаг нэвтрэх линк (бүртгэлгүй хүн дарж киногоо үздэг).
//
// Асуудал (2026-09-27, эзэн): линкийг Messenger-ээр явуулахад киноны нэр, зураг гардаггүй
// байв — линк нь «/#/u/…» хэлбэртэй, Facebook «#»-ийн араас юу ч уншдаггүй тул нүүр
// хуудас гэж ойлгодог. Одоо линк «/u/…» болсон бөгөөд энэ функц токеноор аль кино болохыг
// олж, тухайн киноны хуваалцах хуудсыг (make-shells.mjs-ийн /series/<id> — нэр, зураг,
// тайлбартай) буцаана. Сайт өөрөө хэвээр ачаалагдаж ClaimPage линкийг ашиглана.
//
// md_link_preview нь зөвхөн уншдаг — линкийн эрхийг (claim) зарцуулахгүй. Нуусан кино
// (make-shells алгасдаг) болон сарын эрхийн линк → ерөнхий нүүр хуудасны карт.

const SUPABASE_URL = "https://uloxtmssvloffbwfwzki.supabase.co";
const SUPABASE_ANON = "sb_publishable_uDORytsT_NzUAqnBXnq6Bw_Fk9o0LQ1";

async function seriesFor(token) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/md_link_preview`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${SUPABASE_ANON}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_token: token }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    return j && j.ok && typeof j.series_id === "string" && /^series-[\w-]{1,40}$/.test(j.series_id)
      ? j.series_id
      : null;
  } catch {
    return null;
  }
}

export async function onRequestGet({ request, env, params }) {
  const url = new URL(request.url);
  const token = String(params.token || "");
  const valid = /^[0-9a-f]{8,64}$/i.test(token);

  const id = valid ? await seriesFor(token) : null;
  let page = id ? await env.ASSETS.fetch(new URL(`/series/${id}`, url.origin)) : null;
  if (!page || !page.ok) page = await env.ASSETS.fetch(new URL("/", url.origin));
  let html = await page.text();

  if (valid) {
    // Линкийн хаяг нь ЭНЭ линк хэвээр байх ёстой — /series/<id> гэж заавал Facebook хүнийг
    // үнэгүй эрхгүй киноны хуудас руу явуулж мэднэ
    const self = `${url.origin}/u/${token}`;
    html = html
      .replace(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${self}" />`)
      .replace(/<link rel="canonical"[^>]*>\s*/, "");
  }
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
