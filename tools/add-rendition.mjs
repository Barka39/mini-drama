// HLS кинонд бага чанарын хувилбар (360p) нэмэгч — сул сүлжээнд автоматаар буухын тулд.
//
//   node tools/add-rendition.mjs <seriesId>
//
// Яаж ажилладаг вэ: тоглуулагч (hls.js / iPhone) сүлжээний хурдыг хэмжээд master.m3u8
// доторх хувилбаруудаас өөрөө сонгоно. Сүлжээ муудвал 360p руу бууж ГАЦАХГҮЙ үргэлжилнэ,
// сайжирвал буцаж 720p болно.
//
// ЧУХАЛ: хоёр хувилбарын хэсгүүд ЯГ ИЖИЛ цагт хуваагдсан байх ёстой. Учир нь
//   1) солигдох үед дүрс үсрэхгүй,
//   2) үнэгүй танилцуулгын хил ХЭСГИЙН ДУГААРААР тогтдог (seg_00113 хүртэл үнэгүй гэх мэт) —
//      дугаар зөрвөл бага чанараар илүү урт үнэгүй үзэх цоорхой гарна.
// Тиймээс түлхүүр кадрыг зөвхөн үндсэн хувилбарын хэсгийн хил дээр албадаж тавина.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ffDir = path.join(root, "..", "tale2film", "tools", "ffmpeg");
const ffmpeg = fs.existsSync(path.join(ffDir, "ffmpeg.exe")) ? path.join(ffDir, "ffmpeg.exe") : "ffmpeg";
const ffprobe = fs.existsSync(path.join(ffDir, "ffprobe.exe")) ? path.join(ffDir, "ffprobe.exe") : "ffprobe";

const SHORT_SIDE = 360;
const VIDEO_KBPS = 450;
const AUDIO_KBPS = 64;

function die(msg) {
  console.error(msg);
  process.exit(1);
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (r.status !== 0) die(`${path.basename(cmd)} амжилтгүй (код ${r.status})`);
}

const id = process.argv[2];
if (!id || !/^[\w-]+$/.test(id)) die("хэрэглээ: node tools/add-rendition.mjs <seriesId>");

const base = path.join(root, "media", "hls", id);
const durFile = path.join(root, "tools", "hls-durations", `${id}.json`);
if (!fs.existsSync(path.join(base, "index.m3u8")) || !fs.existsSync(durFile)) {
  die("энэ кино хараахан HLS болоогүй (эхлээд to-hls.mjs)");
}
const durations = JSON.parse(fs.readFileSync(durFile, "utf8"));

// Эх хувилбарын хэмжээ
const probe = spawnSync(
  ffprobe,
  ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0",
    path.join(base, "index.m3u8")],
  { encoding: "utf8" },
);
// HLS жагсаалтыг ffprobe хоёр удаа мөрлөж хэвлэдэг тул зөвхөн эхний мөрийг авна
const [w, h] = (probe.stdout.trim().split(/\r?\n/)[0] || "").split(",").map(Number);
if (!w || !h) die("эх хувилбарын хэмжээг уншиж чадсангүй");
if (Math.min(w, h) <= 480) {
  console.log(`${id}: эх нь аль хэдийн жижиг (${w}x${h}) — бага хувилбар хэрэггүй, алгаслаа.`);
  process.exit(0);
}
const scale = w <= h ? `scale=${SHORT_SIDE}:-2` : `scale=-2:${SHORT_SIDE}`;
const outW = w <= h ? SHORT_SIDE : Math.round((w * SHORT_SIDE) / h / 2) * 2;
const outH = w <= h ? Math.round((h * SHORT_SIDE) / w / 2) * 2 : SHORT_SIDE;

// Хэсгийн хил дэх цагууд (эхний 0-ийг оруулахгүй — эхний кадр угаасаа түлхүүр)
const cuts = [];
let t = 0;
for (let i = 0; i < durations.length - 1; i++) {
  t += durations[i];
  cuts.push(t.toFixed(3));
}

const out = path.join(base, String(SHORT_SIDE));
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

console.log(`${id}: ${w}x${h} → ${outW}x${outH}, ${durations.length} хэсэг. Кодлож байна…`);
run(
  ffmpeg,
  [
    "-v", "error", "-stats", "-y", "-i", path.join(base, "index.m3u8"),
    "-vf", scale,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "27",
    "-maxrate", `${VIDEO_KBPS}k`, "-bufsize", `${VIDEO_KBPS * 2}k`,
    // Түлхүүр кадр ЗӨВХӨН үндсэн хувилбарын хэсгийн хил дээр
    "-sc_threshold", "0", "-g", "99999", "-keyint_min", "99999",
    "-force_key_frames", cuts.join(","),
    "-c:a", "aac", "-b:a", `${AUDIO_KBPS}k`, "-ac", "2",
    "-f", "hls", "-hls_time", "1", "-hls_playlist_type", "vod",
    "-hls_segment_type", "fmp4", "-hls_fmp4_init_filename", "init.mp4",
    "-hls_segment_filename", "seg_%05d.m4s", "-hls_flags", "independent_segments",
    "index.m3u8",
  ],
  { cwd: out },
);

// Хэсгүүд яг давхцсан эсэхийг шалгана — давхцаагүй бол НИЙТЛЭХГҮЙ
const pl = fs.readFileSync(path.join(out, "index.m3u8"), "utf8");
const lowDur = [...pl.matchAll(/^#EXTINF:([\d.]+)/gm)].map((m) => Number(m[1]));
if (lowDur.length !== durations.length) {
  die(`хэсгийн тоо зөрлөө: үндсэн ${durations.length}, бага ${lowDur.length} — нийтэлсэнгүй`);
}
let worst = 0;
let a = 0;
let b = 0;
for (let i = 0; i < durations.length; i++) {
  a += durations[i];
  b += lowDur[i];
  worst = Math.max(worst, Math.abs(a - b));
}
if (worst > 0.25) die(`хэсгийн хил ${worst.toFixed(2)}с зөрлөө (зөвшөөрөх 0.25с) — нийтэлсэнгүй`);
console.log(`хэсгүүд давхцлаа (хамгийн их зөрүү ${worst.toFixed(3)}с)`);

// Бодит дундаж bitrate-ээс master жагсаалт
const total = durations.reduce((x, y) => x + y, 0);
const sizeOf = (dir) =>
  fs.readdirSync(dir).filter((f) => f.endsWith(".m4s")).reduce((n, f) => n + fs.statSync(path.join(dir, f)).size, 0);
const hiBps = Math.round((sizeOf(base) * 8) / total * 1.15);
const loBps = Math.round((sizeOf(out) * 8) / total * 1.15);
const master = [
  "#EXTM3U",
  "#EXT-X-VERSION:7",
  "#EXT-X-INDEPENDENT-SEGMENTS",
  `#EXT-X-STREAM-INF:BANDWIDTH=${hiBps},RESOLUTION=${w}x${h}`,
  "index.m3u8",
  `#EXT-X-STREAM-INF:BANDWIDTH=${loBps},RESOLUTION=${outW}x${outH}`,
  `${SHORT_SIDE}/index.m3u8`,
  "",
].join("\n");
fs.writeFileSync(path.join(base, "master.m3u8"), master);

const mb = Math.round(sizeOf(out) / 1048576);
console.log(`бага хувилбар: ${mb} MB (${Math.round(loBps / 1000)} kbps). R2 руу хуулж байна…`);
run(process.execPath, [path.join(root, "tools", "r2-sync.mjs"), "put", out, `hls/${id}/${SHORT_SIDE}`]);

// master-ийг ХАМГИЙН СҮҮЛД: бага хувилбар бүрэн очсоны дараа л тоглуулагчид харагдана
const tmp = path.join(root, "media", `master-${id}`);
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });
fs.copyFileSync(path.join(base, "master.m3u8"), path.join(tmp, "master.m3u8"));
run(process.execPath, [path.join(root, "tools", "r2-sync.mjs"), "put", tmp, `hls/${id}`]);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`✅ ${id}: сул сүлжээнд 360p руу автоматаар буудаг боллоо.`);
