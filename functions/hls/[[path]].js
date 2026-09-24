// HLS дамжуулагч: /hls/<кино>/<эрхийн тэмдэг>/[<чанар>/]<файл>
//
// Эрхийн тэмдэг нь /api/play-аас олгогдоно (гарын үсэгтэй, хугацаатай). Үнэгүй
// танилцуулгын тэмдэг зөвхөн эхний N хэсгийг нээнэ — үлдсэнийг сервер өөрөө хаана.
//
// 2026-09-24 нэмэлт (Function-ий дуудлага цөөлөх, R2 уншилт хэмнэх):
//  1) КЭШ: init.mp4 болон seg_*.m4s-ийг Cloudflare Cache API-д (ойрын цэгт) хадгална. Кино бүр шинэ id-тай
//     импортлогддог тул хэсгийн агуулга өөрчлөгддөггүй. Хэрэв хэн нэгэн БАЙГАА id-ийн хэсгүүдийг дахин
//     бичвэл CACHE_VERSION-ийг нэмэгдүүлнэ (эс бөгөөс 7 хоног хуучин хэсэг гарна).
//  2) НЭГТГЭЛ: hls.js тоглуулагчид (хөтчийн User-Agent, AppleCoreMedia биш) жагсаалтыг дахин бичиж,
//     хоёр дараалсан хэсгийг нэг «g2_NNNNN.m4s» болгон зарлана (эхний 2 хэсэг ганцаараа — хурдан эхлэл).
//     Нэгтгэсэн хэсгийг хоёр хэсгийг дараалан native pipe-аар урсгаж өгнө (JS хуулалтгүй). fMP4-т нэг
//     хэсэгт олон moof/mdat байж болно (RFC 8216, MSE ISOBMFF). Хуучин seg_ нэрс өмнөх шигээ ажиллана —
//     аль хэдийн олгосон тэмдэг, хуучин iPhone-ийн өөрийн тоглуулагч, tools/verify-hls.mjs өөрчлөгдөхгүй.
//  Үнэгүй багцын хязгаар: 10 мс CPU — байтыг JS-ээр ХЭЗЭЭ Ч хуулахгүй; кэшийн дуудлага ≤ 4/хүсэлт.
//  Буцаах: ЗӨВХӨН GROUPING = false ба/эсвэл SEG_CACHE = false гэж deploy хийнэ. Pages-ийн өмнөх deployment руу
//  шууд rollback ХИЙХГҮЙ — хуучин функц g2_ нэрийг танихгүй (400) тул аль хэдийн нэгтгэсэн жагсаалт ачаалсан
//  тоглуулагчид (тэмдэг 6 цаг хүчинтэй) эвдэрнэ. g2_ боловсруулагчийг нэгтгэл сүүлд үйлчилснээс 6+ цаг хадгална.
import { verifyHlsToken } from "../_lib/sign.js";

const TYPES = {
  m3u8: "application/vnd.apple.mpegurl",
  m4s: "video/iso.segment",
  mp4: "video/mp4",
};

const GROUPING = true;
const SEG_CACHE = true;
const CACHE_VERSION = "v1";
const CACHE_TTL = 7 * 24 * 3600;

// Кэшийн түлхүүрт нууц үгнээс гаргасан тэмдэг — өөр хэн нэгэн манай түлхүүрийг таамаглаж
// кэш «хордуулахаас» сэргийлнэ. Isolate бүрт нэг удаа тооцоолно.
let keyPrefix = null;
async function prefixFor(env) {
  if (keyPrefix) return keyPrefix;
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`mandal-hls-cache:${env.PLAYBACK_SECRET || ""}`));
  keyPrefix = Array.from(new Uint8Array(d).slice(0, 12), (b) => b.toString(16).padStart(2, "0")).join("");
  return keyPrefix;
}

/**
 * init/хэсгийг нээнэ: кэшэнд байвал тэндээс, үгүй бол R2-оос (tee-гээр нэг салааг кэш рүү).
 * { body, size } эсвэл null (байхгүй). Өгөгдлийг JS-ээр хуулахгүй.
 */
async function openMedia(env, waitUntil, origin, key) {
  if (SEG_CACHE) {
    const ck = `${origin}/__hls/${await prefixFor(env)}/${CACHE_VERSION}/${key}`;
    const hit = await caches.default.match(ck).catch(() => undefined);
    if (hit) {
      const n = Number(hit.headers.get("content-length"));
      if (hit.status === 200 && hit.body && Number.isFinite(n) && n > 0) return { body: hit.body, size: n };
      hit.body?.cancel();
    }
    const obj = await env.VIDEOS.get(key);
    if (!obj) return null;
    const [a, b] = obj.body.tee();
    const { readable, writable } = new FixedLengthStream(obj.size);
    b.pipeTo(writable).catch(() => undefined);
    waitUntil(
      caches.default
        .put(ck, new Response(readable, { headers: { "content-type": "application/octet-stream", "cache-control": `public, max-age=${CACHE_TTL}` } }))
        .catch(() => undefined),
    );
    return { body: a, size: obj.size };
  }
  const obj = await env.VIDEOS.get(key);
  return obj ? { body: obj.body, size: obj.size } : null;
}

/** hls.js (хөтөч) эсэх. Apple-ийн өөрийн тоглуулагч «AppleCoreMedia» UA-тай — түүнд өөрчлөлтгүй жагсаалт. */
function wantsGrouped(request) {
  const ua = request.headers.get("user-agent") || "";
  return GROUPING && /Mozilla\//.test(ua) && !/AppleCoreMedia/i.test(ua);
}

const pad5 = (n) => String(n).padStart(5, "0");

/**
 * Жагсаалтыг задлана: EXTINF-ээс өмнөх толгой мөрүүд + (урт, дугаар) жагсаалт.
 * Хүлээгдээгүй бүтэцтэй бол null — тэр үед өмнөх шигээ нэгтгэлгүй өгнө.
 */
function parsePlaylist(text) {
  const lines = text.split(/\r?\n/);
  const header = [];
  const entries = [];
  let i = 0;
  for (; i < lines.length && !lines[i].startsWith("#EXTINF"); i++) {
    if (lines[i]) header.push(lines[i]);
  }
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    if (line === "#EXT-X-ENDLIST") continue;
    const inf = /^#EXTINF:([0-9.]+),/.exec(line);
    if (!inf) return null;
    const seg = /^seg_(\d{5})\.m4s$/.exec(lines[i + 1] || "");
    if (!seg) return null;
    const idx = Number(seg[1]);
    if (idx !== entries.length) return null; // дугаар 0-ээс дараалсан байх ёстой
    entries.push({ dur: Number(inf[1]), durText: inf[1], idx });
    i++;
  }
  if (!entries.length || !header.some((h) => h.startsWith("#EXT-X-TARGETDURATION"))) return null;
  return { header, entries };
}

/** Нэгтгэсэн жагсаалт: 0,1 ганцаараа, дараа нь (2k, 2k+1) хос; сондгой үлдэгдэл ганцаараа. */
function groupedPlaylist(parsed, keep) {
  const entries = parsed.entries.slice(0, keep);
  const items = [];
  for (let i = 0; i < entries.length; ) {
    const e = entries[i];
    const next = entries[i + 1];
    if (e.idx >= 2 && e.idx % 2 === 0 && next && next.idx === e.idx + 1) {
      items.push({ dur: e.dur + next.dur, uri: `g2_${pad5(e.idx)}.m4s` });
      i += 2;
    } else {
      items.push({ dur: e.dur, uri: `seg_${pad5(e.idx)}.m4s` });
      i += 1;
    }
  }
  const origTarget = Number((parsed.header.find((h) => h.startsWith("#EXT-X-TARGETDURATION:")) || "").split(":")[1]) || 0;
  const target = Math.max(origTarget, ...items.map((it) => Math.ceil(it.dur)));
  const out = parsed.header.map((h) => (h.startsWith("#EXT-X-TARGETDURATION:") ? `#EXT-X-TARGETDURATION:${target}` : h));
  for (const it of items) out.push(`#EXTINF:${it.dur.toFixed(6)},`, it.uri);
  out.push("#EXT-X-ENDLIST", "");
  return out.join("\n");
}

export async function onRequestGet(context) {
  const { request, env, params } = context;
  const waitUntil = (p) => context.waitUntil(p);
  const origin = new URL(request.url).origin;
  const parts = Array.isArray(params.path) ? params.path : [String(params.path || "")];
  // [кино, тэмдэг, файл]  эсвэл  [кино, тэмдэг, чанар, файл]
  if (parts.length < 3 || parts.length > 4) return new Response("bad_request", { status: 400 });
  const [seriesId, token] = parts;
  const rendition = parts.length === 4 ? parts[2] : null;
  const file = parts[parts.length - 1];

  if (!/^[\w-]+$/.test(seriesId)) return new Response("bad_request", { status: 400 });
  if (rendition !== null && !/^\d{3,4}$/.test(rendition)) return new Response("bad_request", { status: 400 });
  const fm = /^(?:(index|master)\.m3u8|init\.mp4|seg_(\d{5})\.m4s|g2_(\d{5})\.m4s)$/.exec(file);
  if (!fm) return new Response("bad_request", { status: 400 });

  const grant = await verifyHlsToken(env, seriesId, token);
  if (!grant) return new Response("link_expired", { status: 403 });

  // Танилцуулгын хил: хэсгийн дугаар 0-ээс эхэлдэг тул N хэсэг = 0..N-1
  if (fm[2] !== undefined && grant.max !== "a" && Number(fm[2]) >= grant.max) {
    return new Response("preview_ended", { status: 403 });
  }

  const dir = `hls/${seriesId}/${rendition ? rendition + "/" : ""}`;
  const segHeaders = (size) => ({
    "content-type": TYPES.m4s,
    "content-length": String(size),
    // Хаяг нь хэрэглэгч бүрийн тэмдэгтэй тул хуваалцсан кэшэд үлдээхгүй
    "cache-control": "private, max-age=3600",
  });

  // Нэгтгэсэн хэсэг g2_N = seg_N + seg_(N+1). N тэгш, ≥ 2. Танилцуулгад хоёулаа хилээс ӨМНӨ байх ёстой.
  if (fm[3] !== undefined) {
    const n = Number(fm[3]);
    if (n < 2 || n % 2 !== 0) return new Response("bad_request", { status: 400 });
    if (grant.max !== "a" && n + 2 > grant.max) return new Response("preview_ended", { status: 403 });
    const [p1, p2] = await Promise.all([
      openMedia(env, waitUntil, origin, `${dir}seg_${pad5(n)}.m4s`),
      openMedia(env, waitUntil, origin, `${dir}seg_${pad5(n + 1)}.m4s`),
    ]);
    if (!p1 || !p2) {
      p1?.body.cancel().catch(() => undefined);
      p2?.body.cancel().catch(() => undefined);
      return new Response("not_found", { status: 404 });
    }
    const total = p1.size + p2.size;
    const { readable, writable } = new FixedLengthStream(total);
    const pump = (async () => {
      try {
        await p1.body.pipeTo(writable, { preventClose: true });
        await p2.body.pipeTo(writable);
      } catch (e) {
        p2.body.cancel().catch(() => undefined);
        await writable.abort(e).catch(() => undefined); // тоглуулагч цуцалсан эсвэл уншилт бүтэлгүйтсэн
      }
    })();
    waitUntil(pump);
    return new Response(readable, { status: 200, headers: segHeaders(total) });
  }

  const key = `${dir}${file}`;

  // Хэсэг, init: кэшээс эсвэл R2-оос (агуулга өөрчлөгдөхгүй)
  if (fm[1] === undefined) {
    const media = await openMedia(env, waitUntil, origin, key);
    if (!media) return new Response("not_found", { status: 404 });
    const h = segHeaders(media.size);
    h["content-type"] = TYPES[file.split(".").pop()] || "application/octet-stream";
    return new Response(media.body, { status: 200, headers: h });
  }

  const obj = await env.VIDEOS.get(key);
  if (!obj) return new Response("not_found", { status: 404 });

  // Нэгтгэсэн жагсаалт (hls.js). Танилцуулгад эхний max хэсэг л орно — хос хэзээ ч хилийг давахгүй.
  if (fm[1] === "index" && wantsGrouped(request)) {
    const text = await obj.text();
    const parsed = parsePlaylist(text);
    if (parsed) {
      const keep = grant.max === "a" ? parsed.entries.length : Math.min(grant.max, parsed.entries.length);
      return new Response(groupedPlaylist(parsed, keep), {
        status: 200,
        headers: { "content-type": TYPES.m3u8, "cache-control": "private, no-store" },
      });
    }
    // Хүлээгдээгүй бүтэц: доорх хуучин логикоор (текстийг дахин ашиглана)
    return legacyIndex(text, grant);
  }

  // Танилцуулга: жагсаалтыг ӨӨРИЙГ НЬ тайрч өгнө — тоглуулагч зөвхөн үнэгүй хэсгийг
  // бүтэн «кино» гэж харна. Яагаад: тоглуулагчид урьдчилан татдаг тул хилээс цаашхи
  // хэсгийг гуйж 403 авдаг; Chrome-ийн өөрийн HLS тоглуулагч тэр хариуг бичлэг гэж
  // задлах гээд БҮХЭЛДЭЭ унадаг (DEMUXER_ERROR) — төлбөрийн санал гарахаас өмнө.
  // Тайрсан жагсаалттай бол хэн ч хилээс цааш гуйхгүй, дуусахад нь санал гарна.
  if (fm[1] === "index" && grant.max !== "a") return legacyIndex(await obj.text(), grant);

  const headers = new Headers();
  headers.set("content-type", TYPES[file.split(".").pop()] || "application/octet-stream");
  headers.set("content-length", String(obj.size));
  headers.set("cache-control", "private, max-age=3600");
  return new Response(obj.body, { status: 200, headers });
}

/** Хуучин (нэгтгэлгүй) жагсаалт: эрхгүй бол эхний max хэсгээр тайрна, эрхтэй бол бүтнээр. */
function legacyIndex(text, grant) {
  if (grant.max === "a") {
    return new Response(text, { status: 200, headers: { "content-type": TYPES.m3u8, "cache-control": "private, max-age=3600" } });
  }
  const lines = text.split(/\r?\n/);
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
