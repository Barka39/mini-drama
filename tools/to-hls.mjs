// Киног «нэг бүтэн бичлэг» (HLS) болгогч.
//
//   node tools/to-hls.mjs from-episodes <seriesId>     одоо байгаа ангиудыг чанар алдалгүй нийлүүлнэ
//   node tools/to-hls.mjs from-file <seriesId> <файл>  аль хэдийн шахагдсан нэг файлаас
//   node tools/to-hls.mjs drop-episodes <seriesId>     шилжсэний ДАРАА хуучин ангиудыг R2-оос устгана
//
// Дахин кодлохгүй (-c copy) тул кино бүр ~10 секунд. Гарах зүйлс:
//   media/hls/<id>/            локал хэсгүүд (git-д орохгүй)
//   tools/hls-durations/<id>.json   хэсгүүдийн урт — deploy.ps1 үүгээр серверт үнэгүй хэсгийн
//                                   хилийг тооцуулна (сайтын багцад ОРОХГҮЙ, 1000 тоо тул)
//   catalog.json → series.hls = { duration }
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ffDir = path.join(root, "..", "tale2film", "tools", "ffmpeg");
const ffmpeg = fs.existsSync(path.join(ffDir, "ffmpeg.exe")) ? path.join(ffDir, "ffmpeg.exe") : "ffmpeg";
const catalogPath = path.join(root, "src", "data", "catalog.json");
const SEG_SECONDS = 8;

function die(msg) {
  console.error(msg);
  process.exit(1);
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (r.status !== 0) die(`${path.basename(cmd)} амжилтгүй (код ${r.status})`);
}

function readCatalog() {
  return JSON.parse(fs.readFileSync(catalogPath, "utf8").replace(/^﻿/, ""));
}

function writeCatalog(cat) {
  fs.writeFileSync(catalogPath, JSON.stringify(cat, null, 2) + "\n", "utf8");
}

function segment(id, inputArgs) {
  const out = path.join(root, "media", "hls", id);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  // cwd = гарах хавтас: жагсаалт доторх хаягууд харьцангуй (seg_00001.m4s) байх ёстой —
  // эрхийн тэмдэг замд суудаг тул бүтэн зам бичигдвэл тоглохгүй.
  run(
    ffmpeg,
    [
      "-v", "error", "-y", ...inputArgs, "-c", "copy",
      "-f", "hls", "-hls_time", String(SEG_SECONDS), "-hls_playlist_type", "vod",
      "-hls_segment_type", "fmp4", "-hls_fmp4_init_filename", "init.mp4",
      "-hls_segment_filename", "seg_%05d.m4s", "-hls_flags", "independent_segments",
      "index.m3u8",
    ],
    { cwd: out },
  );
  const playlist = fs.readFileSync(path.join(out, "index.m3u8"), "utf8");
  const durations = [...playlist.matchAll(/^#EXTINF:([\d.]+)/gm)].map((m) => Number(m[1]));
  const segFiles = fs.readdirSync(out).filter((f) => /^seg_\d{5}\.m4s$/.test(f));
  if (!durations.length || durations.length !== segFiles.length) {
    die(`хэсгийн тоо зөрлөө: жагсаалтад ${durations.length}, хавтсанд ${segFiles.length}`);
  }
  if (segFiles.length > 99999) die("хэт олон хэсэг");
  return { out, durations };
}

function finish(id, durations, out) {
  const total = Math.round(durations.reduce((a, b) => a + b, 0) * 10) / 10;
  const durDir = path.join(root, "tools", "hls-durations");
  fs.mkdirSync(durDir, { recursive: true });
  fs.writeFileSync(path.join(durDir, `${id}.json`), JSON.stringify(durations));

  console.log(`\n${durations.length} хэсэг, ${Math.round(total / 60)} минут. R2 руу хуулж байна…`);
  run(process.execPath, [path.join(root, "tools", "r2-sync.mjs"), "put", out, `hls/${id}`]);
  console.log("Бүгд очсон эсэхийг шалгаж байна…");
  run(process.execPath, [path.join(root, "tools", "r2-sync.mjs"), "check", out, `hls/${id}`]);

  const cat = readCatalog();
  const s = cat.series.find((x) => x.id === id);
  if (!s) die(`catalog.json-д ${id} алга`);
  s.hls = { duration: total };
  writeCatalog(cat);
  console.log(`\n✅ «${s.title}» нэг бүтэн кино боллоо (${Math.round(total / 60)} мин).`);
  console.log("   Сайтад гаргах: tools\\deploy.ps1");
  console.log("⚠ Хэрэв энэ кино (id) сайт дээр ӨМНӨ НЬ байсан бол functions/hls/[[path]].js доторх CACHE_VERSION-ийг нэмэгдүүлээд deploy хийнэ үү — эс бөгөөс Cloudflare-ийн кэш 7 хоног хуучин хэсгүүдийг өгнө.");
  // Зөвхөн хуучин ангиас шилжүүлсэн кинонд: шалгасны дараа ангиудыг устгаж зай чөлөөлнө
  if (s.episodes.length) console.log("   Дараа нь: node tools/to-hls.mjs drop-episodes " + id);
}

const [cmd, id, file] = process.argv.slice(2);
if (!cmd || !id || !/^[\w-]+$/.test(id)) {
  die("хэрэглээ: from-episodes <id> | from-file <id> <файл> | drop-episodes <id>");
}

if (cmd === "from-episodes") {
  const s = readCatalog().series.find((x) => x.id === id);
  if (!s) die(`catalog.json-д ${id} алга`);
  const dir = path.join(root, "media", "videos");
  const files = s.episodes.map((e) => path.join(dir, path.basename(e.video)));
  const missing = files.filter((f) => !fs.existsSync(f));
  if (missing.length) die(`локал анги дутуу (${missing.length}): ${path.basename(missing[0])} …`);
  const list = path.join(root, "media", `concat-${id}.txt`);
  fs.writeFileSync(list, files.map((f) => `file '${f.replace(/\\/g, "/")}'`).join("\n"));
  const { out, durations } = segment(id, ["-f", "concat", "-safe", "0", "-i", list]);
  fs.rmSync(list, { force: true });
  // Нийлүүлсэн урт ангиудын нийлбэртэй таарах ёстой — таарахгүй бол ямар нэг анги гэмтэлтэй
  const want = s.episodes.reduce((a, e) => a + e.duration, 0);
  const got = durations.reduce((a, b) => a + b, 0);
  if (Math.abs(want - got) > 5) die(`урт зөрлөө: ангиуд ${want.toFixed(1)}с, HLS ${got.toFixed(1)}с`);
  finish(id, durations, out);
} else if (cmd === "from-file") {
  if (!file || !fs.existsSync(file)) die("файл олдсонгүй: " + file);
  const { out, durations } = segment(id, ["-i", path.resolve(file)]);
  finish(id, durations, out);
} else if (cmd === "drop-episodes") {
  const cat = readCatalog();
  const s = cat.series.find((x) => x.id === id);
  if (!s) die(`catalog.json-д ${id} алга`);
  if (!s.hls) die("энэ кино хараахан HLS болоогүй — ангиудыг устгавал тоглохоо болино");
  const keys = s.episodes.map((e) => "videos/" + path.basename(e.video));
  if (!keys.length) die("устгах анги алга");
  run(process.execPath, [path.join(root, "tools", "r2-sync.mjs"), "del", ...keys]);
  s.episodes = [];
  writeCatalog(cat);
  console.log(`✅ ${keys.length} хуучин анги R2-оос устлаа (локал хуулбар media\\videos-д хэвээр).`);
} else {
  die("үл мэдэгдэх команд: " + cmd);
}
