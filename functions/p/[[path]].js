// Постерын зураг дамжуулагч (нээлттэй).
//
// Бичлэгээс ялгаатай нь постер бол зарын зураг — нуух шаардлагагүй, тиймээс
// гарын үсэг шалгахгүй. Нэр бүр өвөрмөц (шинэ зураг = шинэ нэр) тул удаан кэшэлж болно.

export async function onRequestGet({ env, params }) {
  const file = Array.isArray(params.path) ? params.path.join("/") : String(params.path || "");
  if (!/^[\w.-]+\.(jpg|png)$/.test(file)) return new Response("bad_request", { status: 400 });

  const obj = await env.VIDEOS.get(`posters/${file}`);
  if (!obj) return new Response("not_found", { status: 404 });

  const headers = new Headers();
  headers.set("content-type", obj.httpMetadata?.contentType || "image/jpeg");
  headers.set("content-length", String(obj.size));
  headers.set("cache-control", "public, max-age=31536000, immutable");
  return new Response(obj.body, { status: 200, headers });
}
