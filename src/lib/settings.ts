// Сайтын тохиргоо (данс г.м) сервер талд md_settings-д хадгалагдана —
// эзэн админ хуудаснаас удирдана, код руу орох шаардлагагүй.
import { supa } from "./supa";
import { CONFIG } from "../config";

/** QPay (Byl) онлайн төлбөр: off = нуугдмал, admin = зөвхөн админд (туршилт), on = бүгдэд */
export type OnlinePayMode = "off" | "admin" | "on";

export interface SiteSettings {
  bank_name: string;
  account_number: string;
  iban: string;
  account_name: string;
  contact: string;
  online_pay: OnlinePayMode;
}

const FALLBACK: SiteSettings = {
  bank_name: CONFIG.bank.bankName,
  account_number: CONFIG.bank.accountNumber,
  iban: "",
  account_name: CONFIG.bank.accountName,
  contact: CONFIG.contact,
  online_pay: "off",
};

/** Энэ хэрэглэгчид «QPay-ээр төлөх» товч харагдах уу */
export function onlinePayFor(settings: SiteSettings | null, isAdmin: boolean): boolean {
  if (!settings) return false;
  return settings.online_pay === "on" || (settings.online_pay === "admin" && isAdmin);
}

let cached: SiteSettings | null = null;

export async function getSettings(): Promise<SiteSettings> {
  if (cached) return cached;
  const { data } = await supa
    .from("md_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (data) {
    const mode = data.online_pay;
    cached = {
      bank_name: data.bank_name || FALLBACK.bank_name,
      account_number: data.account_number || FALLBACK.account_number,
      iban: data.iban || "",
      account_name: data.account_name || FALLBACK.account_name,
      contact: data.contact || FALLBACK.contact,
      online_pay: mode === "on" || mode === "admin" ? mode : "off",
    };
    return cached;
  }
  return FALLBACK;
}

/** АДМИН: онлайн төлбөрийн горимыг солино */
export async function setOnlinePay(mode: OnlinePayMode): Promise<{ ok: boolean; reason?: string }> {
  const { error } = await supa.rpc("md_set_online_pay", { p_mode: mode });
  if (error) return { ok: false, reason: error.message };
  if (cached) cached = { ...cached, online_pay: mode };
  return { ok: true };
}

export async function saveSettings(s: SiteSettings): Promise<{ ok: boolean; reason?: string }> {
  const { error } = await supa.rpc("md_update_settings", {
    p_bank_name: s.bank_name,
    p_account_number: s.account_number,
    p_iban: s.iban,
    p_account_name: s.account_name,
    p_contact: s.contact,
  });
  if (error) return { ok: false, reason: error.message };
  cached = { ...s };
  return { ok: true };
}
