// Хавтсыг R2 сан руу зэрэгцээгээр хуулагч / устгагч.
//
// Яагаад wrangler биш вэ: HLS кино ~1000 жижиг файлтай. wrangler файл бүрд шинээр
// асдаг тул нэг кинонд нэг цаг зарцуулна. Энэ нь Cloudflare-ийн API-г шууд дуудаж
// хэдэн минутад дуусгана. Түлхүүрүүд .env-ээс (CLOUDFLARE_API_TOKEN / _ACCOUNT_ID).
//
//   node tools/r2-sync.mjs put <локал хавтас> <R2 угтвар>     ж: put media/hls/abc hls/abc
//   node tools/r2-sync.mjs del <R2 түлхүүр> [<түлхүүр> ...]
//   node tools/r2-sync.mjs check <локал хавтас> <R2 угтвар>   (бүгд очсон эсэх)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/)
    .filter((l) => /^\w+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const TOKEN = env.CLOUDFLARE_API_TOKEN, ACC = env.CLOUDFLARE_ACCOUNT_ID, BUCKET = "minidram";
if (!TOKEN || !ACC) { console.error(".env дотор Cloudflare түлхүүр алга"); process.exit(1); }

const TYPES = { ".m3u8": "application/vnd.apple.mpegurl", ".m4s": "video/iso.segment", ".mp4": "video/mp4", ".ts": "video/mp2t", ".jpg": "image/jpeg", ".vtt": "text/vtt" };
const objUrl = (key) => `https://api.cloudflare.com/client/v4/accounts/${ACC}/r2/buckets/${BUCKET}/objects/${encodeURIComponent(key)}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withRetry(label, fn) {
  for (let i = 1; ; i++) {
    try { return await fn(); }
    catch (e) {
      if (i >= 6) throw new Error(`${label}: ${e.message}`);
      await sleep(1500 * i); // 429/503 түр зуурынх — хүлээгээд дахин
    }
  }
}

async function put(key, file) {
  const body = fs.readFileSync(file);
  await withRetry(key, async () => {
    const res = await fetch(objUrl(key), {
      method: "PUT",
      headers: { Authorization: `Bearer ${TOKEN}`, "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" },
      body,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  });
}

async function exists(key) {
  return withRetry(key, async () => {
    const res = await fetch(objUrl(key), { headers: { Authorization: `Bearer ${TOKEN}`, Range: "bytes=0-0" } });
    if (res.status === 404) return false;
    if (res.status === 200 || res.status === 206) { await res.arrayBuffer(); return true; }
    throw new Error(`HTTP ${res.status}`);
  });
}

async function del(key) {
  await withRetry(key, async () => {
    const res = await fetch(objUrl(key), { method: "DELETE", headers: { Authorization: `Bearer ${TOKEN}` } });
    if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`);
  });
}

// Cloudflare API: 5 минутад 1200 хүсэлт. Зэрэгцээ 6 + хүсэлт бүрийн өмнө богино
// завсар = секундэд ~3.5 — хязгаараас доогуур, гэхдээ wrangler-ээс 10 дахин хурдан.
async function pool(items, worker, size = 6) {
  let next = 0, done = 0;
  const started = Date.now();
  await Promise.all(Array.from({ length: size }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await worker(item);
      done++;
      if (done % 100 === 0 || done === items.length) {
        console.log(`  ${done}/${items.length}  (${Math.round((Date.now() - started) / 1000)} сек)`);
      }
      await sleep(280 * size / 6 * 6 / size * 1); // ~280мс завсар/ажилчин
    }
  }));
}

const [cmd, a, b] = process.argv.slice(2);
if (cmd === "put" || cmd === "check") {
  const dir = path.resolve(a), prefix = b.replace(/\/$/, "");
  const files = fs.readdirSync(dir).filter((f) => fs.statSync(path.join(dir, f)).isFile());
  // Жагсаалт (m3u8)-ыг ХАМГИЙН СҮҮЛД хуулна: хагас хуулагдсан киног хэн ч тоглуулж эхлэхгүй
  files.sort((x, y) => (x.endsWith(".m3u8") ? 1 : 0) - (y.endsWith(".m3u8") ? 1 : 0) || x.localeCompare(y));
  if (cmd === "put") {
    console.log(`${files.length} файл → ${prefix}/`);
    await pool(files, (f) => put(`${prefix}/${f}`, path.join(dir, f)));
    console.log("хуулж дууслаа");
  } else {
    const missing = [];
    await pool(files, async (f) => { if (!(await exists(`${prefix}/${f}`))) missing.push(f); });
    console.log(missing.length ? `ДУТУУ ${missing.length}: ${missing.slice(0, 10).join(", ")}` : `бүгд байна (${files.length})`);
    if (missing.length) process.exit(2);
  }
} else if (cmd === "del") {
  const keys = process.argv.slice(3);
  console.log(`${keys.length} түлхүүр устгана`);
  await pool(keys, del);
  console.log("устгаж дууслаа");
} else {
  console.error("хэрэглээ: put|check <хавтас> <угтвар>  |  del <түлхүүр...>"); process.exit(1);
}
