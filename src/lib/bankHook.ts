// Автомат баталгаажуулалтын эрүүл мэнд.
//
// Банкны мессеж дамжуулагч (Android утасны програм) ажиллаж байгаа эсэхийг
// эзэн харах ёстой. Харагдахгүй бол чимээгүй унтарч, захиалга бүр гараар
// баталгаажиж, худалдан авагч цагаар хүлээдэг.
import { supa } from "./supa";
import { SITE } from "./accessLinks";

export interface BankMsg {
  amount: number;
  matched: boolean;
  purchase_id: number | null;
  created_at: string;
}

export interface BankStatus {
  secret: string;
  total: number;
  matched: number;
  last_at: string | null;
  recent: BankMsg[];
  avg_minutes: number | null;
  pending: number;
}

export async function loadBankStatus(): Promise<BankStatus | null> {
  const { data, error } = await supa.rpc("md_bank_status");
  if (error || !data) return null;
  return data as BankStatus;
}

/** Утасны програмд оруулах хаяг (нууц түлхүүр агуулсан тул зөвхөн админд) */
export function bankHookUrl(secret: string): string {
  return `${SITE}/api/bank-sms?k=${secret}`;
}

/** «3 минутын өмнө» гэх мэт ойлгомжтой бичиглэл */
export function agoText(iso: string | null): string {
  if (!iso) return "хэзээ ч";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "дөнгөж сая";
  if (mins < 60) return `${mins} минутын өмнө`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} цагийн өмнө`;
  return `${Math.round(hours / 24)} хоногийн өмнө`;
}
