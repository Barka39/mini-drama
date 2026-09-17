// Тоглуулах холбоосын гарын үсэг (HMAC-SHA256).
//
// Нууц түлхүүр нь Pages-ийн орчны хувьсагчид (PLAYBACK_SECRET) байрлана —
// клиент код руу хэзээ ч очихгүй. Түлхүүргүйгээр хүчинтэй холбоос зохиох
// боломжгүй тул шууд файл руу хандах оролдлого бүтэхгүй.

async function keyFor(env) {
  const secret = env.PLAYBACK_SECRET;
  if (!secret) throw new Error("PLAYBACK_SECRET тохируулаагүй байна");
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

function toHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function signPlaybackToken(env, file, exp) {
  const key = await keyFor(env);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${file}:${exp}`));
  return toHex(sig).slice(0, 32);
}

export async function verifyPlaybackToken(env, file, exp, sig) {
  if (!exp || !sig) return false;
  if (Number(exp) < Math.floor(Date.now() / 1000)) return false;
  const expected = await signPlaybackToken(env, file, Number(exp));
  // Тогтмол хугацааны харьцуулалт (цагийн зөрүүгээр таамаглахаас сэргийлнэ)
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

// ---------- HLS (нэг бүтэн кино) ----------
//
// Кино нь жагсаалт (index.m3u8) + олон жижиг хэсгээс тогтоно. Хэсэг бүрд тусад нь
// гарын үсэг өгвөл жагсаалтыг дахин бичих хэрэгтэй болно. Оронд нь эрхийг ЗАМ ДОТОР
// нь суулгана:  /hls/<кино>/<exp>.<max>.<sig>/seg_00012.m4s
// Жагсаалт доторх харьцангуй хаягууд (seg_00012.m4s) тэр замыг өөрөө өвлөнө.
//
// max = "a"  → бүх хэсэг (төлсөн / сарын эрхтэй / үнэгүй кино)
// max = N    → зөвхөн эхний N хэсэг (үнэгүй танилцуулга). Төлөөгүй хүн N-ээс
//              хойших хэсгийг нэрээр нь гуйсан ч сервер өгөхгүй — клиентэд найдахгүй.
export async function signHlsToken(env, seriesId, exp, max) {
  const key = await keyFor(env);
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`hls:${seriesId}:${exp}:${max}`),
  );
  return `${exp}.${max}.${toHex(sig).slice(0, 32)}`;
}

/** Зөв бол { max } буцаана ("a" эсвэл тоо), эс бөгөөс null */
export async function verifyHlsToken(env, seriesId, token) {
  const m = /^(\d{9,11})\.(a|\d{1,6})\.([0-9a-f]{32})$/.exec(token || "");
  if (!m) return null;
  const exp = Number(m[1]);
  if (exp < Math.floor(Date.now() / 1000)) return null;
  const expected = await signHlsToken(env, seriesId, exp, m[2]);
  if (expected.length !== token.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  if (diff !== 0) return null;
  return { max: m[2] === "a" ? "a" : Number(m[2]) };
}
