import { useEffect, useRef, useState } from "react";
import { chromeUrl, watchChromeHandoff } from "../lib/inapp";

/**
 * iPhone-ийн Facebook/Messenger дотор «Төлбөр төлөх» товч — жинхэнэ <a href="googlechromes://…">.
 * Facebook зөвхөн хүн өөрөө дарсан холбоосоор Chrome-г нээхийг зөвшөөрдөг тул төлбөрийн хаяг
 * (url) урьдчилан бэлэн байх ёстой. Бэлэн болтол «Түр хүлээнэ үү…».
 *
 * ДАРАХ МӨЧИД ЮУ Ч ӨӨРЧЛӨХГҮЙ (2026-09-27): өмнөх хувилбар дарах мөчид цонхны төлөвийг сольж
 * энэ товчийг өөр товчоор солидог байсан — Chrome суусан эзний утсан дээр нээгдээгүй, харин
 * дарахад юу ч хөдөлдөггүй туршилтын холбоос (/t/iab2) нээгдсэн. Тиймээс шошгыг хэсэг хугацааны
 * дараа л солино; «хүлээж байна» төлөв нь хэрэглэгч Chrome-оос БУЦАЖ ирэхэд (onReturn) гарна.
 */
export function ChromePayButton({
  url,
  kind,
  label,
  onReturn,
}: {
  url: string | null;
  kind: "movie" | "sub";
  label: string;
  onReturn?: () => void;
}) {
  const [opening, setOpening] = useState(false);
  const left = useRef(false);

  // Chrome руу гарсан бол (хуудас нуугдсан) буцаж ирэхэд хэвийн байдалдаа орж, төлбөрийг шалгана
  useEffect(() => {
    if (!opening) return;
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        left.current = true;
      } else if (left.current) {
        left.current = false;
        setOpening(false);
        onReturn?.();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [opening, onReturn]);

  if (!url) {
    return (
      <button className="btn btn-primary" disabled>
        Түр хүлээнэ үү…
      </button>
    );
  }
  return (
    <a
      className="btn btn-primary"
      href={chromeUrl(url)}
      onClick={() => {
        watchChromeHandoff(url, kind);
        // Дарах мөчид DOM-ыг хөдөлгөхгүй — навигаци эхэлсний дараа шошгыг солино
        window.setTimeout(() => setOpening(true), 600);
      }}
    >
      {opening ? "Түр хүлээнэ үү…" : label}
    </a>
  );
}
