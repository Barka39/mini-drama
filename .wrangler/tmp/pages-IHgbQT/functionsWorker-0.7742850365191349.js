var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// api/bank-sms.js
var SUPABASE_URL = "https://uloxtmssvloffbwfwzki.supabase.co";
var SUPABASE_ANON = "sb_publishable_uDORytsT_NzUAqnBXnq6Bw_Fk9o0LQ1";
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}
__name(json, "json");
function parseBankSms(text) {
  if (!text) return null;
  const m = /ORLOGO\s*:\s*([\d,]+(?:\.\d+)?)\s*MNT/i.exec(text);
  if (!m) return null;
  const amount = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const u = /Utga\s*:\s*(.*)$/is.exec(text);
  const utga = u ? u[1].trim() : "";
  return { amount, utga };
}
__name(parseBankSms, "parseBankSms");
async function handle(request, env) {
  const url = new URL(request.url);
  const secret = env.BANK_HOOK_SECRET;
  if (!secret) return json({ error: "not_configured" }, 500);
  const given = url.searchParams.get("k") || request.headers.get("x-md-secret") || "";
  if (given !== secret) return json({ error: "forbidden" }, 403);
  let text = "";
  const ctype = request.headers.get("content-type") || "";
  if (ctype.includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    text = body.text || body.message || body.msg || body.body || "";
  } else if (ctype.includes("form")) {
    const form = await request.formData();
    text = form.get("text") || form.get("message") || form.get("msg") || form.get("body") || "";
  } else {
    text = await request.text();
  }
  text = String(text || "").trim();
  if (!text) return json({ error: "empty" }, 400);
  const parsed = parseBankSms(text);
  if (!parsed) {
    return json({ ok: true, ignored: true });
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/md_confirm_by_amount`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON, "content-type": "application/json" },
    body: JSON.stringify({
      p_secret: secret,
      p_amount: parsed.amount,
      p_raw: text.slice(0, 500),
      p_utga: parsed.utga.slice(0, 200)
    })
  });
  if (!res.ok) return json({ error: "confirm_failed", status: res.status }, 502);
  const result = await res.json();
  return json({ ok: true, amount: parsed.amount, ...result });
}
__name(handle, "handle");
var onRequestPost = /* @__PURE__ */ __name(({ request, env }) => handle(request, env), "onRequestPost");
var onRequestGet = /* @__PURE__ */ __name(({ request, env }) => {
  const url = new URL(request.url);
  const text = url.searchParams.get("text") || url.searchParams.get("message") || "";
  const fake = new Request(url.toString(), {
    method: "POST",
    headers: { "content-type": "application/json", "x-md-secret": request.headers.get("x-md-secret") || "" },
    body: JSON.stringify({ text })
  });
  return handle(fake, env);
}, "onRequestGet");

// _lib/sign.js
async function keyFor(env) {
  const secret = env.PLAYBACK_SECRET;
  if (!secret) throw new Error("PLAYBACK_SECRET \u0442\u043E\u0445\u0438\u0440\u0443\u0443\u043B\u0430\u0430\u0433\u04AF\u0439 \u0431\u0430\u0439\u043D\u0430");
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
}
__name(keyFor, "keyFor");
function toHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(toHex, "toHex");
async function signPlaybackToken(env, file, exp) {
  const key = await keyFor(env);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${file}:${exp}`));
  return toHex(sig).slice(0, 32);
}
__name(signPlaybackToken, "signPlaybackToken");
async function verifyPlaybackToken(env, file, exp, sig) {
  if (!exp || !sig) return false;
  if (Number(exp) < Math.floor(Date.now() / 1e3)) return false;
  const expected = await signPlaybackToken(env, file, Number(exp));
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}
__name(verifyPlaybackToken, "verifyPlaybackToken");
async function signHlsToken(env, seriesId, exp, max) {
  const key = await keyFor(env);
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`hls:${seriesId}:${exp}:${max}`)
  );
  return `${exp}.${max}.${toHex(sig).slice(0, 32)}`;
}
__name(signHlsToken, "signHlsToken");
async function verifyHlsToken(env, seriesId, token) {
  const m = /^(\d{9,11})\.(a|\d{1,6})\.([0-9a-f]{32})$/.exec(token || "");
  if (!m) return null;
  const exp = Number(m[1]);
  if (exp < Math.floor(Date.now() / 1e3)) return null;
  const expected = await signHlsToken(env, seriesId, exp, m[2]);
  if (expected.length !== token.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  if (diff !== 0) return null;
  return { max: m[2] === "a" ? "a" : Number(m[2]) };
}
__name(verifyHlsToken, "verifyHlsToken");

// api/play.js
var SUPABASE_URL2 = "https://uloxtmssvloffbwfwzki.supabase.co";
var SUPABASE_ANON2 = "sb_publishable_uDORytsT_NzUAqnBXnq6Bw_Fk9o0LQ1";
var TTL = 60 * 30;
function json2(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}
__name(json2, "json");
var HLS_TTL = 60 * 60 * 6;
async function isEntitled(request, seriesId) {
  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return false;
  const [subRes, buyRes] = await Promise.all([
    fetch(`${SUPABASE_URL2}/rest/v1/md_profiles?select=vip_until`, {
      headers: { apikey: SUPABASE_ANON2, Authorization: auth }
    }),
    fetch(
      `${SUPABASE_URL2}/rest/v1/md_purchases?series_id=eq.${encodeURIComponent(seriesId)}&status=eq.confirmed&select=id`,
      { headers: { apikey: SUPABASE_ANON2, Authorization: auth } }
    )
  ]);
  if (!subRes.ok || !buyRes.ok) return false;
  const profs = await subRes.json();
  const vipUntil = Array.isArray(profs) && profs[0] ? profs[0].vip_until : null;
  if (vipUntil && new Date(vipUntil).getTime() > Date.now()) return true;
  const buys = await buyRes.json();
  return Array.isArray(buys) && buys.length > 0;
}
__name(isEntitled, "isEntitled");
async function playHls(request, env, seriesId) {
  const metaRes = await fetch(
    `${SUPABASE_URL2}/rest/v1/md_series?id=eq.${encodeURIComponent(seriesId)}&select=price,free_eps,free_minutes,hidden,hls`,
    { headers: { apikey: SUPABASE_ANON2 } }
  );
  const rows = await metaRes.json();
  const meta = Array.isArray(rows) ? rows[0] : null;
  if (!meta) return json2({ error: "unknown_series" }, 404);
  if (meta.hidden) return json2({ error: "hidden" }, 403);
  if (!meta.hls) return json2({ error: "not_hls" }, 400);
  const free = Number(meta.price ?? 0) <= 0;
  const entitled = free || await isEntitled(request, seriesId);
  const max = entitled ? "a" : Math.max(0, Number(meta.free_eps ?? 0));
  const exp = Math.floor(Date.now() / 1e3) + HLS_TTL;
  const token = await signHlsToken(env, seriesId, exp, max);
  const master = await env.VIDEOS.head(`hls/${seriesId}/master.m3u8`);
  return json2({
    url: `/hls/${seriesId}/${token}/${master ? "master" : "index"}.m3u8`,
    exp,
    entitled,
    // Клиент энэ секундэд төлбөрийн саналыг харуулна. Серверийн хил үүнээс
    // ХОЙНО байдаг (тэр цонхонд ЭХЭЛСЭН хэсэг бүтнээрээ үнэгүй) тул бичлэг
    // саналаас өмнө гацахгүй.
    previewSeconds: entitled ? null : Number(meta.free_minutes ?? 0) * 60
  });
}
__name(playHls, "playHls");
async function onRequestGet2({ request, env }) {
  const url = new URL(request.url);
  const seriesId = url.searchParams.get("series") || "";
  if (url.searchParams.get("kind") === "hls") {
    if (!/^[\w-]+$/.test(seriesId)) return json2({ error: "bad_request" }, 400);
    return playHls(request, env, seriesId);
  }
  const ep = Number(url.searchParams.get("ep") || 0);
  const file = url.searchParams.get("file") || "";
  if (!seriesId || !ep || !file) return json2({ error: "bad_request" }, 400);
  if (!Number.isInteger(ep) || ep < 1 || !/^[\w-]+$/.test(seriesId)) {
    return json2({ error: "bad_request" }, 400);
  }
  if (file !== `${seriesId}_e${ep}.mp4`) {
    return json2({ error: "bad_file" }, 400);
  }
  const metaRes = await fetch(
    `${SUPABASE_URL2}/rest/v1/md_series?id=eq.${encodeURIComponent(seriesId)}&select=price,free_eps,hidden,hls`,
    { headers: { apikey: SUPABASE_ANON2 } }
  );
  const metaRows = await metaRes.json();
  const meta = Array.isArray(metaRows) ? metaRows[0] : null;
  if (!meta) return json2({ error: "unknown_series" }, 404);
  if (meta.hidden) return json2({ error: "hidden" }, 403);
  if (meta.hls) return json2({ error: "moved_to_hls" }, 410);
  const freeEps = Number(meta.free_eps ?? 0);
  const price = Number(meta.price ?? 0);
  const isFree = price <= 0 || ep <= freeEps;
  if (!isFree) {
    const auth = request.headers.get("authorization") || "";
    if (!auth.startsWith("Bearer ")) return json2({ error: "auth_required" }, 401);
    const [subRes, buyRes] = await Promise.all([
      fetch(`${SUPABASE_URL2}/rest/v1/md_profiles?select=vip_until`, {
        headers: { apikey: SUPABASE_ANON2, Authorization: auth }
      }),
      fetch(
        `${SUPABASE_URL2}/rest/v1/md_purchases?series_id=eq.${encodeURIComponent(seriesId)}&status=eq.confirmed&select=id`,
        { headers: { apikey: SUPABASE_ANON2, Authorization: auth } }
      )
    ]);
    if (!subRes.ok || !buyRes.ok) return json2({ error: "auth_failed" }, 401);
    const profs = await subRes.json();
    const vipUntil = Array.isArray(profs) && profs[0] ? profs[0].vip_until : null;
    const hasVip = vipUntil && new Date(vipUntil).getTime() > Date.now();
    if (!hasVip) {
      const buys = await buyRes.json();
      if (!Array.isArray(buys) || buys.length === 0) {
        return json2({ error: "not_purchased" }, 403);
      }
    }
  }
  const exp = Math.floor(Date.now() / 1e3) + TTL;
  const sig = await signPlaybackToken(env, file, exp);
  return json2({ url: `/v/${file}?exp=${exp}&sig=${sig}`, exp });
}
__name(onRequestGet2, "onRequestGet");

// api/poster.js
var SUPABASE_URL3 = "https://uloxtmssvloffbwfwzki.supabase.co";
var SUPABASE_ANON3 = "sb_publishable_uDORytsT_NzUAqnBXnq6Bw_Fk9o0LQ1";
var MAX_BYTES = 4 * 1024 * 1024;
function json3(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}
__name(json3, "json");
async function onRequestPost2({ request, env }) {
  const url = new URL(request.url);
  const seriesId = url.searchParams.get("series") || "";
  if (!/^[\w-]+$/.test(seriesId)) return json3({ error: "bad_series" }, 400);
  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return json3({ error: "auth_required" }, 401);
  const meRes = await fetch(`${SUPABASE_URL3}/rest/v1/md_profiles?select=is_admin`, {
    headers: { apikey: SUPABASE_ANON3, Authorization: auth }
  });
  const me = await meRes.json();
  if (!Array.isArray(me) || !me[0]?.is_admin) return json3({ error: "not_admin" }, 403);
  const type = (request.headers.get("content-type") || "").split(";")[0].trim();
  if (type !== "image/jpeg" && type !== "image/png") return json3({ error: "bad_type" }, 400);
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength) return json3({ error: "empty" }, 400);
  if (bytes.byteLength > MAX_BYTES) return json3({ error: "too_big" }, 413);
  const ext = type === "image/png" ? "png" : "jpg";
  const name = `${seriesId}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.${ext}`;
  await env.VIDEOS.put(`posters/${name}`, bytes, { httpMetadata: { contentType: type } });
  return json3({ url: `/p/${name}` });
}
__name(onRequestPost2, "onRequestPost");

// hls/[[path]].js
var TYPES = {
  m3u8: "application/vnd.apple.mpegurl",
  m4s: "video/iso.segment",
  mp4: "video/mp4"
};
async function onRequestGet3({ request, env, params }) {
  const parts = Array.isArray(params.path) ? params.path : [String(params.path || "")];
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
  if (fm[2] !== void 0 && grant.max !== "a" && Number(fm[2]) >= grant.max) {
    return new Response("preview_ended", { status: 403 });
  }
  const key = `hls/${seriesId}/${rendition ? rendition + "/" : ""}${file}`;
  const obj = await env.VIDEOS.get(key);
  if (!obj) return new Response("not_found", { status: 404 });
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
      headers: { "content-type": TYPES.m3u8, "cache-control": "private, no-store" }
    });
  }
  const headers = new Headers();
  headers.set("content-type", TYPES[file.split(".").pop()] || "application/octet-stream");
  headers.set("content-length", String(obj.size));
  headers.set("cache-control", "private, max-age=3600");
  return new Response(obj.body, { status: 200, headers });
}
__name(onRequestGet3, "onRequestGet");

// p/[[path]].js
async function onRequestGet4({ env, params }) {
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
__name(onRequestGet4, "onRequestGet");

// v/[[path]].js
var KEY_PREFIX = "videos/";
async function onRequestGet5({ request, env, params }) {
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
  headers.set("cache-control", "private, max-age=1800");
  const range = request.headers.get("range");
  const m = range && /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (m) {
    let start;
    let end;
    if (m[1] === "") {
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
__name(onRequestGet5, "onRequestGet");

// ../.wrangler/tmp/pages-IHgbQT/functionsRoutes-0.3403961387191321.mjs
var routes = [
  {
    routePath: "/api/bank-sms",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet]
  },
  {
    routePath: "/api/bank-sms",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost]
  },
  {
    routePath: "/api/play",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet2]
  },
  {
    routePath: "/api/poster",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost2]
  },
  {
    routePath: "/hls/:path*",
    mountPath: "/hls",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet3]
  },
  {
    routePath: "/p/:path*",
    mountPath: "/p",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet4]
  },
  {
    routePath: "/v/:path*",
    mountPath: "/v",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet5]
  }
];

// ../../../../AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/path-to-regexp/dist.es2015/index.js
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");

// ../../../../AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/pages-template-worker.ts
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult) {
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: mountMatchResult.path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: /* @__PURE__ */ __name(() => {
            isFailOpen = true;
          }, "passThroughOnException")
        };
        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error) {
      if (isFailOpen) {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");
export {
  pages_template_worker_default as default
};
