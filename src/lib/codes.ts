// Нэг удаагийн цэнэглэлтийн код: MD<coins>-<nonce>-<sig>
// Эзэн tools/make-code.ps1-ээр үүсгэж, хэрэглэгчид Messenger-ээр илгээнэ.
// Анхаар: баталгаажуулалт client талд тул энэ нь түр зуурын (MVP) шийдэл —
// backend (Supabase) орж ирэхээр сервер талын баталгаажуулалтаар солигдоно.
import { CONFIG } from "../config";

async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface RedeemResult {
  ok: boolean;
  coins?: number;
  reason?: string;
}

export async function verifyCode(code: string, redeemed: string[]): Promise<RedeemResult> {
  const trimmed = code.trim().toUpperCase();
  const m = trimmed.match(/^MD(\d+)-([A-Z0-9]{4})-([A-F0-9]{6})$/);
  if (!m) return { ok: false, reason: "Кодын бичиглэл буруу байна (жишээ: MD100-A7K2-3F9B1C)" };
  const [, coinsStr, nonce, sig] = m;
  const expected = (await hmacHex(CONFIG.codeSecret, `${coinsStr}:${nonce}`))
    .slice(0, 6)
    .toUpperCase();
  if (sig !== expected) return { ok: false, reason: "Код буруу байна" };
  if (redeemed.includes(trimmed)) return { ok: false, reason: "Энэ код аль хэдийн ашиглагдсан байна" };
  return { ok: true, coins: Number(coinsStr) };
}
