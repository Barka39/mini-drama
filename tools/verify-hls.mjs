// Амьд сайт дээрх HLS кино бүрийг зочны нүдээр шалгагч.
//   node tools/verify-hls.mjs [https://kinomandal.com]
// Кино бүрд: хаяг олгогдох → зочны жагсаалт үнэгүй минуттай таарах → сүүлийн үнэгүй хэсэг 200 →
// хилээс цааш 403 → киноны сүүлийн хэсэг 403 → хуучин ангийн зам хаалттай (410).
// Мөн R2-д СҮҮЛИЙН хэсэг үнэхээр байгаа эсэхийг (бүтэн хуулагдсан уу) админ API-аар шалгана.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const site = (process.argv[2] || "https://kinomandal.com").replace(/\/$/, "");
const env = Object.fromEntries(
  fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/)
    .filter((l) => /^\w+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const cat = JSON.parse(fs.readFileSync(path.join(root, "src", "data", "catalog.json"), "utf8").replace(/^﻿/, ""));

const code = async (url, init) => (await fetch(url, init)).status;
const seg = (n) => `seg_${String(n).padStart(5, "0")}.m4s`;

async function r2Has(key) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/r2/buckets/minidram/objects/${encodeURIComponent(key)}`,
    { headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, Range: "bytes=0-0" } },
  );
  await res.arrayBuffer();
  return res.status === 200 || res.status === 206;
}

let bad = 0;
for (const s of cat.series.filter((x) => x.hls)) {
  const problems = [];
  const durations = JSON.parse(fs.readFileSync(path.join(root, "tools", "hls-durations", `${s.id}.json`), "utf8"));
  const last = durations.length - 1;

  const play = await (await fetch(`${site}/api/play?kind=hls&series=${s.id}`)).json();
  if (!play.url) problems.push(`хаяг олгогдсонгүй: ${JSON.stringify(play)}`);
  else {
    const base = site + play.url.replace(/\/(index|master)\.m3u8$/, "");
    const pl = await (await fetch(`${base}/index.m3u8`)).text();
    const n = (pl.match(/^seg_/gm) || []).length;
    const secs = [...pl.matchAll(/^#EXTINF:([\d.]+)/gm)].reduce((a, m) => a + Number(m[1]), 0);
    if (s.price > 0) {
      if (play.entitled) problems.push("зочин «эрхтэй» гэж гарлаа!");
      if (secs < s.freeMinutes * 60 || secs > s.freeMinutes * 60 + 20) {
        problems.push(`үнэгүй хэсэг ${Math.round(secs)}с (хүлээсэн ~${s.freeMinutes * 60}с)`);
      }
      if ((await code(`${base}/${seg(n - 1)}`)) !== 200) problems.push("сүүлийн үнэгүй хэсэг нээгдсэнгүй");
      if ((await code(`${base}/${seg(n)}`)) !== 403) problems.push("ХИЛЭЭС ЦААШХИ ХЭСЭГ НЭЭЛТТЭЙ!");
      if ((await code(`${base}/${seg(last)}`)) !== 403) problems.push("КИНОНЫ ТӨГСГӨЛ НЭЭЛТТЭЙ!");
    }
    if ((await code(`${base}/init.mp4`)) !== 200) problems.push("init.mp4 алга");
    var shown = `${n} хэсэг / ${Math.round(secs)}с үнэгүй`;
  }
  const legacy = await code(`${site}/api/play?series=${s.id}&ep=1&file=${s.id}_e1.mp4`);
  if (legacy !== 410) problems.push(`хуучин ангийн зам ${legacy} (410 байх ёстой)`);
  if (!(await r2Has(`hls/${s.id}/${seg(last)}`))) problems.push("R2-д сүүлийн хэсэг АЛГА (дутуу хуулагдсан)");
  if (!(await r2Has(`hls/${s.id}/${seg(Math.floor(last / 2))}`))) problems.push("R2-д дунд хэсэг алга");

  if (problems.length) bad++;
  console.log(`${problems.length ? "❌" : "✅"} ${s.title.padEnd(36)} ${String(durations.length).padStart(5)} хэсэг · ${shown ?? ""}${problems.length ? "\n     " + problems.join("\n     ") : ""}`);
}
console.log(bad ? `\n${bad} кинонд асуудал байна` : "\nБүх кино зөв");
process.exit(bad ? 1 : 0);
