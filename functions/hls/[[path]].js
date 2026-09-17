// HLS дамжуулагч: /hls/<кино>/<эрхийн тэмдэг>/[<чанар>/]<файл>
//
// Эрхийн тэмдэг нь /api/play-аас олгогдоно (гарын үсэгтэй, хугацаатай). Үнэгүй
// танилцуулгын тэмдэг зөвхөн эхний N хэсгийг нээнэ — үлдсэнийг сервер өөрөө хаана.
import { verifyHlsToken } from "../_lib/sign.js";

const TYPES = {
  m3u8: "application/vnd.apple.mpegurl",
  m4s: "video/iso.segment",
  mp4: "video/mp4",
};

export async function onRequestGet({ request, env, params }) {
  const parts = Array.isArray(params.path) ? params.path : [String(params.path || "")];
  // [кино, тэмдэг, файл]  эсвэл  [кино, тэмдэг, чанар, файл]
  if (parts.length < 3 || parts.length > 4) return new Response("bad_request", { status: 400 });
  const [seriesId, token] = parts;
  const rendition = parts.length === 4 ? parts[2] : null;
  const file = parts[parts.length - 1];

  if (!/^[\w-]+$/.test(seriesId)) return new Response("bad_request", { status: 400 });
  if (rendition !== null && !/^\d{3,4}$/.test(rendition)) return new Response("bad_request", { status: 400 });
  const fm = /^(?:(index|master)\.m3u8|init\.mp4|seg_(\d{5})\.m4s)$/.exec(file);
  if (!fm) return new Response("bad_request", { status: 400 });

  const grant = await verifyHlsToken(env, seriesId, token);
  if (!grant) return new Response("link_expired", { status: 403 });

  // Танилцуулгын хил: хэсгийн дугаар 0-ээс эхэлдэг тул N хэсэг = 0..N-1
  if (fm[2] !== undefined && grant.max !== "a" && Number(fm[2]) >= grant.max) {
    return new Response("preview_ended", { status: 403 });
  }

  const key = `hls/${seriesId}/${rendition ? rendition + "/" : ""}${file}`;
  const obj = await env.VIDEOS.get(key);
  if (!obj) return new Response("not_found", { status: 404 });

  // Танилцуулга: жагсаалтыг ӨӨРИЙГ НЬ тайрч өгнө — тоглуулагч зөвхөн үнэгүй хэсгийг
  // бүтэн «кино» гэж харна. Яагаад: тоглуулагчид урьдчилан татдаг тул хилээс цаашхи
  // хэсгийг гуйж 403 авдаг; Chrome-ийн өөрийн HLS тоглуулагч тэр хариуг бичлэг гэж
  // задлах гээд БҮХЭЛДЭЭ унадаг (DEMUXER_ERROR) — төлбөрийн санал гарахаас өмнө.
  // Тайрсан жагсаалттай бол хэн ч хилээс цааш гуйхгүй, дуусахад нь санал гарна.
  if (fm[1] === "index" && grant.max !== "a") {
    const lines = (await obj.text()).split(/\r?\n/);
    const out = [];
    let kept = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith("#EXTINF")) {
        if (kept >= grant.max) break;
        out.push(line, lines[i + 1] || "");
        i++;
        kept++;
      } else if (line && line !== "#EXT-X-ENDLIST" && !/^seg_/.test(line)) {
        out.push(line);
      }
    }
    out.push("#EXT-X-ENDLIST", "");
    return new Response(out.join("\n"), {
      status: 200,
      headers: { "content-type": TYPES.m3u8, "cache-control": "private, no-store" },
    });
  }

  const headers = new Headers();
  headers.set("content-type", TYPES[file.split(".").pop()] || "application/octet-stream");
  headers.set("content-length", String(obj.size));
  // Хаяг нь хэрэглэгч бүрийн тэмдэгтэй тул хуваалцсан кэшэд үлдээхгүй
  headers.set("cache-control", "private, max-age=3600");
  return new Response(obj.body, { status: 200, headers });
}
