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
const SRC_KEY = "md-src";

/** Хаанаас ирснийг тэмдэглэнэ: ?src=fb гэх мэт. Session-д хадгална. */
function source(): string {
  try {
    const stored = sessionStorage.getItem(SRC_KEY);
    if (stored) return stored;
    // Хаяг нь #/... хэлбэртэй тул query нь хашийн өмнө ч, хойно ч байж болно
    const fromSearch = new URLSearchParams(location.search).get("src");
    const hashQ = location.hash.includes("?") ? location.hash.split("?")[1] : "";
    const fromHash = new URLSearchParams(hashQ).get("src");
    const src = (fromSearch || fromHash || "").slice(0, 20);
    if (src) sessionStorage.setItem(SRC_KEY, src);
    return src;
  } catch {
    return "";
  }
}

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
    .insert({
      sid: sessionId(),
      event,
      series_id: seriesId ?? null,
      ep: ep ?? null,
      src: source(),
    })
    .then(() => {
      /* хэмжилт бүтэлгүйтвэл хэрэглэгчид нөлөөлөхгүй */
    });
}
