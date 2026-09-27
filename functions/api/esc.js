// /api/esc?m=<туршилтын нэр>[&mode=meta] — зөвхөн /t/iab2 туршилтад.
//
// Facebook-ийн iPhone дотоод хөтөч x-safari-https:// руу ШУУД шилжихийг хаадаг (эзний iPhone,
// 2026-09-27). Сервер 302-оор, эсвэл <meta refresh>-ээр тийш чиглүүлбэл өөрөөр шалгагддаг
// эсэхийг туршина. Чиглэл нь үргэлж манай өөрийн /t/iab2 — өөр сайт руу чиглүүлэх хуурамч линк
// болгож ашиглах боломжгүй.
export function onRequestGet({ request }) {
  const url = new URL(request.url);
  const m = (url.searchParams.get("m") || "s-302").replace(/[^a-z0-9-]/g, "").slice(0, 12);
  const to = `x-safari-https://${url.host}/t/iab2?from=safari&m=${m}`;
  if (url.searchParams.get("mode") === "meta") {
    return new Response(
      `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${to}">` +
        `<meta name="viewport" content="width=device-width"><body style="background:#07080b;color:#aaa;font:16px sans-serif;padding:24px">` +
        `Түр хүлээнэ үү… Юу ч болохгүй бол буцах сумаар буцаарай.</body>`,
      { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
    );
  }
  return new Response(null, { status: 302, headers: { Location: to, "Cache-Control": "no-store" } });
}
