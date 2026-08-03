// Бичлэг дамжуулагч. Зөвхөн /api/play-аас олгосон, хугацаа нь дуусаагүй,
// гарын үсэг нь зөв холбоосоор л файл гарна. R2 сан нь шууд нээлттэй биш.
//
// ЧУХАЛ (туршилтаар батлагдсан): Cloudflare-ийн ирмэг Range хүсэлтийг ӨӨРӨӨ
// боловсруулж, энэ функц рүү Range толгойг дамжуулдаггүй. Тиймээс бид бүтэн
// биетийг Content-Length-тэй нь буцаах ёстой — хэрчиж өгөх ажлыг ирмэг хийнэ.
// Хэсэгчилж буцаавал урд руу гүйлгэх (seek) эвдэрч, гар утсанд огт эхлэхгүй.
import { verifyPlaybackToken } from "../_lib/sign.js";

export async function onRequestGet({ request, env, params }) {
  const file = Array.isArray(params.path) ? params.path.join("/") : String(params.path || "");
  if (!/^[\w.-]+\.mp4$/.test(file)) return new Response("bad_request", { status: 400 });

  const url = new URL(request.url);
  const exp = url.searchParams.get("exp");
  const ok = await verifyPlaybackToken(env, file, exp, url.searchParams.get("sig") || "");
  if (!ok) return new Response("link_expired", { status: 403 });

  const obj = await env.VIDEOS.get(`videos/${file}`);
  if (!obj) return new Response("not_found", { status: 404 });

  const headers = new Headers();
  headers.set("content-type", "video/mp4");
  headers.set("content-length", String(obj.size));
  headers.set("accept-ranges", "bytes");
  // Холбоос бүр өвөрмөц (exp+sig) тул ирмэгт кэшлэх нь аюулгүй ба хэрэгтэй:
  // кэшгүй бол ирмэг мужаар үйлчилж чадахгүй, бүтэн файлыг илгээж эхэлдэг.
  headers.set("cache-control", "private, max-age=1800");

  return new Response(obj.body, { status: 200, headers });
}
