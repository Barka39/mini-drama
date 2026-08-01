import { createClient } from "@supabase/supabase-js";
import { CONFIG } from "../config";

export const supa = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Утасны дугаарыг нэвтрэлтийн имэйл болгож хувиргана (Supabase auth имэйл шаарддаг)
export function phoneToEmail(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length !== 8) return null;
  return `${digits}@minidram.app`;
}
