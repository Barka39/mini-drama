// Cloudflare Pages-ийн нууц хувьсагчдыг .env файлаас тохируулна.
//
//   node tools/pages-secrets.mjs BYL_TOKEN BYL_WEBHOOK_SECRET BYL_PROJECT_ID
//
// Production болон preview хоёуланд нь бичнэ. Утгыг хэзээ ч дэлгэцэнд хэвлэхгүй
// (зөвхөн нэр, урт). Өмнө байсан хувьсагч (PLAYBACK_SECRET г.м) алга болвол
// алдаа өгнө. Шинэ утга ДАРААГИЙН deploy-оос хүчинтэй болно.
import { readFileSync } from "node:fs";

const envText = readFileSync(new URL("../.env", import.meta.url), "utf8");
const env = {};
for (const line of envText.split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const names = process.argv.slice(2);
if (!names.length) {
  console.error("Хэрэглээ: node tools/pages-secrets.mjs НЭР1 НЭР2 ...");
  process.exit(1);
}
const vars = {};
for (const n of names) {
  if (!env[n]) {
    console.error(`${n} — .env файлд хоосон байна`);
    process.exit(1);
  }
  vars[n] = { type: "secret_text", value: env[n] };
}

const api = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/pages/projects/minidram`;
const headers = { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, "Content-Type": "application/json" };
const keys = (project, which) =>
  Object.keys(project?.result?.deployment_configs?.[which]?.env_vars ?? {});

const before = await (await fetch(api, { headers })).json();
if (!before.success) {
  console.error("Cloudflare-аас төслийг уншиж чадсангүй:", JSON.stringify(before.errors));
  process.exit(1);
}

const res = await fetch(api, {
  method: "PATCH",
  headers,
  body: JSON.stringify({
    deployment_configs: { production: { env_vars: vars }, preview: { env_vars: vars } },
  }),
});
const after = await res.json();
if (!after.success) {
  console.error("Тохируулж чадсангүй:", JSON.stringify(after.errors));
  process.exit(1);
}

for (const which of ["production", "preview"]) {
  const lost = keys(before, which).filter((k) => !keys(after, which).includes(k));
  if (lost.length) {
    console.error(`АНХААР: ${which} орчноос алга болсон хувьсагч: ${lost.join(", ")}`);
    process.exit(2);
  }
}
console.log(
  "OK:",
  names.map((n) => `${n} (${env[n].length} тэмдэгт)`).join(", "),
  "→ production + preview. Дараагийн deploy-оос хүчинтэй.",
);
