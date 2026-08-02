// Сайтын тохиргоо (данс г.м) сервер талд md_settings-д хадгалагдана —
// эзэн админ хуудаснаас удирдана, код руу орох шаардлагагүй.
import { supa } from "./supa";
import { CONFIG } from "../config";

export interface SiteSettings {
  bank_name: string;
  account_number: string;
  iban: string;
  account_name: string;
  contact: string;
}

const FALLBACK: SiteSettings = {
  bank_name: CONFIG.bank.bankName,
  account_number: CONFIG.bank.accountNumber,
  iban: "",
  account_name: CONFIG.bank.accountName,
  contact: CONFIG.contact,
};

let cached: SiteSettings | null = null;

export async function getSettings(): Promise<SiteSettings> {
  if (cached) return cached;
  const { data } = await supa
    .from("md_settings")
    .select("bank_name, account_number, iban, account_name, contact")
    .eq("id", 1)
    .maybeSingle();
  if (data) {
    cached = {
      bank_name: data.bank_name || FALLBACK.bank_name,
      account_number: data.account_number || FALLBACK.account_number,
      iban: data.iban || "",
      account_name: data.account_name || FALLBACK.account_name,
      contact: data.contact || FALLBACK.contact,
    };
    return cached;
  }
  return FALLBACK;
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
