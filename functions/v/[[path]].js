// Бичлэг дамжуулагч. Зөвхөн /api/play-аас олгосон, хугацаа нь дуусаагүй,
// гарын үсэг нь зөв холбоосоор л файл гарна. R2 сан нь шууд нээлттэй биш.
//
// Range (муж) боловсруулалт — 2026-08-05-нд дахин хэмжсэн:
// Урьд нь Cloudflare-ийн ирмэг Range толгойг энэ функц рүү дамжуулдаггүй байсан
// тул бид бүтэн биетийг буцаадаг байв. ОДОО дамжуулдаг болсон нь батлагдлаа
// (x-range-seen туршилт). Ирмэгийн кэш мужаар үйлчлэхгүй байсан тул хэрэглэгч
// урагш гүйлгэх бүрд бүтэн 38MB дахин татагддаг байсан. Иймд мужийг ӨӨРСДӨӨ
// R2-оос хэрчиж 206-аар буцаана — гүйлгэлт шуурхай, дата хэмнэнэ.
import { verifyPlaybackToken } from "../_lib/sign.js";

const KEY_PREFIX = "videos/";

export async function onRequestGet({ request, env, params }) {
  const file = Array.isArray(params.path) ? params.path.join("/") : String(params.path || "");
  if (!/^[\w.-]+\.mp4$/.test(file)) return new Response("bad_request", { status: 400 });

  const url = new URL(request.url);
  const exp = url.searchParams.get("exp");
  const ok = await verifyPlaybackToken(env, file, exp, url.searchParams.get("sig") || "");
  if (!ok) return new Response("link_expired", { status: 403 });

  const key = KEY_PREFIX + file;
  const head = await env.VIDEOS.head(key);
  if (!head) return new Response("not_found", { status: 404 });
  const size = head.size;

  const headers = new Headers();
  headers.set("content-type", "video/mp4");
  headers.set("accept-ranges", "bytes");
  // Холбоос бүр өвөрмөц (exp+sig) тул кэшлэх нь аюулгүй; мужийг өөрсдөө
  // боловсруулдаг болсон тул кэшнээс хамаарахаа больсон.
  headers.set("cache-control", "private, max-age=1800");

  const range = request.headers.get("range");
  const m = range && /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (m) {
    let start;
    let end;
    if (m[1] === "") {
      // «сүүлийн N байт» хэлбэр (bytes=-N)
      const n = Number(m[2] || 0);
      if (!n) return new Response("bad_range", { status: 416 });
      start = Math.max(0, size - n);
      end = size - 1;
    } else {
      start = Number(m[1]);
      end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
    }
    if (!Number.isFinite(start) || start >= size || start > end) {
      headers.set("content-range", `bytes */${size}`);
      return new Response("range_not_satisfiable", { status: 416, headers });
    }
    const length = end - start + 1;
    const part = await env.VIDEOS.get(key, { range: { offset: start, length } });
    if (!part) return new Response("not_found", { status: 404 });
    headers.set("content-length", String(length));
    headers.set("content-range", `bytes ${start}-${end}/${size}`);
    return new Response(part.body, { status: 206, headers });
  }

  const obj = await env.VIDEOS.get(key);
  if (!obj) return new Response("not_found", { status: 404 });
  headers.set("content-length", String(size));
  return new Response(obj.body, { status: 200, headers });
}
