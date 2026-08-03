// Борлуулалтын юүлүүрийн хэмжилт.
//
// Зорилго: «хэдэн хүн орсон» биш, «хаана унтарч байна» гэдгийг мэдэх.
// Хувийн мэдээлэл хадгалахгүй — зөвхөн санамсаргүй session дугаар.
import { supa } from "./supa";

export type TrackEvent =
  | "open_series" // киноны хуудас нээсэн
  | "watch_start" // тоглуулж эхэлсэн
  | "paywall_hit" // түгжээтэй ангид хүрсэн
  | "buy_click" // «Худалдаж авах» дарсан
  | "order_created"; // захиалга үүсгэсэн

const SID_KEY = "md-sid";

function sessionId(): string {
  try {
    let id = localStorage.getItem(SID_KEY);
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(SID_KEY, id);
    }
    return id;
  } catch {
    return "anon0000";
  }
}

// Нэг session-д ижил үйлдлийг дахин дахин бүртгэхгүй (тоо гажихгүй)
const sentOnce = new Set<string>();

export function track(event: TrackEvent, seriesId?: string, ep?: number) {
  const key = `${event}:${seriesId ?? ""}`;
  if (sentOnce.has(key)) return;
  sentOnce.add(key);

  void supa
    .from("md_events")
    .insert({ sid: sessionId(), event, series_id: seriesId ?? null, ep: ep ?? null })
    .then(() => {
      /* хэмжилт бүтэлгүйтвэл хэрэглэгчид нөлөөлөхгүй */
    });
}
