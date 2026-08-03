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
