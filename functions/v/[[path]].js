// Бичлэг дамжуулагч. Зөвхөн /api/play-аас олгосон, хугацаа нь дуусаагүй,
// гарын үсэг нь зөв холбоосоор л файл гарна. R2 сан нь шууд нээлттэй биш.
import { verifyPlaybackToken } from "../_lib/sign.js";

export async function onRequestGet({ request, env, params }) {
  const file = Array.isArray(params.path) ? params.path.join("/") : String(params.path || "");
  if (!/^[\w.-]+\.mp4$/.test(file)) return new Response("bad_request", { status: 400 });

  const url = new URL(request.url);
  const ok = await verifyPlaybackToken(
    env,
    file,
    url.searchParams.get("exp"),
    url.searchParams.get("sig") || "",
  );
  if (!ok) return new Response("link_expired", { status: 403 });

  // Range хүсэлтийг дэмжинэ — эс бөгөөс видео урагш/хойш гүйлгэхэд ажиллахгүй
  const range = request.headers.get("range");
  let obj;
  if (range) {
    const m = /bytes=(\d+)-(\d*)/.exec(range);
    if (m) {
      const offset = Number(m[1]);
      const end = m[2] ? Number(m[2]) : undefined;
      obj = await env.VIDEOS.get(`videos/${file}`, {
        range: end === undefined ? { offset } : { offset, length: end - offset + 1 },
      });
    }
  }
  if (!obj) obj = await env.VIDEOS.get(`videos/${file}`);
  if (!obj) return new Response("not_found", { status: 404 });

  const headers = new Headers();
  headers.set("content-type", "video/mp4");
  headers.set("accept-ranges", "bytes");
  // Хуваалцсан холбоос кэшнээс амилахаас сэргийлнэ
  headers.set("cache-control", "private, max-age=0, no-store");

  if (obj.range && "offset" in obj.range) {
    const start = obj.range.offset;
    const len = obj.range.length ?? obj.size - start;
    headers.set("content-range", `bytes ${start}-${start + len - 1}/${obj.size}`);
    headers.set("content-length", String(len));
    return new Response(obj.body, { status: 206, headers });
  }

  headers.set("content-length", String(obj.size));
  return new Response(obj.body, { status: 200, headers });
}
