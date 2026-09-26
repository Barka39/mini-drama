// Кино бүрийн «хуваалцах» хуудас: docs/series/<id>.html ба docs/movie/<id>.html.
//
// Яагаад: хүмүүс хөтчийн хаягийг ШУУД хуулж Messenger-ээр явуулдаг. Facebook-ийн
// робот JavaScript ажиллуулдаггүй, #-ийн араас юу ч уншдаггүй — тэгэхээр бүх линк
// нүүр хуудасны ерөнхий картыг харуулж, киноны нэр/зураг гардаггүй байв (хүмүүс
// сэжиглээд дарахгүй). Одоо хаяг нь #-гүй (kinomandal.com/movie/<id>), сервер тэр
// замд энэ файлыг өгнө: index.html-тэй ЯГ ижил апп, зөвхөн <head>-ийн нэр, тайлбар,
// зураг нь тухайн киноных. Мэдээллийг make-landing.ps1-ийн /k/<id> хуудаснаас авна
// (нэг газар тооцогдоно). Нуусан киноны хуудас үүсгэхгүй.
//
// deploy.ps1 build-ийн ДАРАА ажиллуулна (vite build docs хавтсыг цэвэрлэдэг).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const docs = path.join(root, "docs");
const SITE = (process.env.SITE_URL || "https://kinomandal.com").replace(/\/$/, "");
const SUPABASE_URL = "https://uloxtmssvloffbwfwzki.supabase.co";
const SUPABASE_ANON = "sb_publishable_uDORytsT_NzUAqnBXnq6Bw_Fk9o0LQ1";

const index = fs.readFileSync(path.join(docs, "index.html"), "utf8");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "src", "data", "catalog.json"), "utf8"));

// Нуусан киног (админ хуудаснаас) алгасна — нэр нь линкэнд гарах ёсгүй
let hidden = new Set();
try {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/md_series?select=id&hidden=eq.true`, {
    headers: { apikey: SUPABASE_ANON },
  });
  if (res.ok) hidden = new Set((await res.json()).map((r) => r.id));
} catch {
  console.warn("АНХААР: нуусан киноны жагсаалтыг авч чадсангүй — бүх кинонд хуудас үүснэ");
}

// index.html-ийн толгойноос ерөнхий нэр/тайлбар/картыг хасна (кинонхоор солино)
const HEAD_TAGS = [
  /<title>[\s\S]*?<\/title>\s*/,
  /<meta\s+name="description"[\s\S]*?\/>\s*/,
  /<meta\s+property="og:[^"]*"[\s\S]*?\/>\s*/g,
  /<meta\s+name="twitter:[^"]*"[\s\S]*?\/>\s*/g,
  /<link\s+rel="canonical"[\s\S]*?\/>\s*/,
];
let base = index;
for (const re of HEAD_TAGS) base = base.replace(re, "");
// Эдгээр хуудас үргэлж /series/, /movie/ дотор — asset-ийн хаягийг сайтын үндэснээс
// болгоно (<base>-ийг бичдэг script-ээс үл хамааран зөв ачаална)
base = base.replace(/(src|href)="\.\//g, '$1="/');
if (!base.includes("</head>")) throw new Error("docs/index.html-д </head> алга");

function pick(html, re) {
  const m = re.exec(html);
  return m ? m[0] : "";
}

let made = 0;
for (const s of catalog.series) {
  if (!s.id || hidden.has(s.id)) continue;
  const landing = path.join(docs, "k", `${s.id}.html`);
  if (!fs.existsSync(landing)) continue;
  const k = fs.readFileSync(landing, "utf8");
  const tags = [
    pick(k, /<title>[\s\S]*?<\/title>/),
    pick(k, /<meta name="description"[^>]*\/>/),
    ...(k.match(/<meta property="og:(?!url)[^"]*"[^>]*\/>/g) ?? []),
    pick(k, /<meta name="twitter:card"[^>]*\/>/),
  ].filter(Boolean);
  if (!tags.some((t) => t.includes("og:image"))) continue;

  for (const route of ["series", "movie"]) {
    const url = `${SITE}/${route}/${s.id}`;
    const head =
      tags.map((t) => `    ${t}\n`).join("") +
      `    <meta property="og:url" content="${url}" />\n` +
      `    <link rel="canonical" href="${SITE}/series/${s.id}" />\n`;
    const html = base.replace("</head>", () => `${head}  </head>`);
    const dir = path.join(docs, route);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${s.id}.html`), html);
  }
  made++;
}
console.log(`Хуваалцах хуудас: ${made} кино × 2 (/series, /movie)${hidden.size ? `, нуусан ${hidden.size} алгассан` : ""}`);
