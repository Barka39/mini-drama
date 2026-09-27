import { useEffect, useState } from "react";
import { chromeUrl, watchChromeHandoff } from "../lib/inapp";

/**
 * iPhone-ийн Facebook/Messenger дотор «Төлбөр төлөх» товч — жинхэнэ <a href="googlechromes://…">.
 * Facebook зөвхөн хүн өөрөө дарсан холбоосоор Chrome-г нээхийг зөвшөөрдөг тул төлбөрийн хаяг
 * (url) урьдчилан бэлэн байх ёстой. Бэлэн болтол «Түр хүлээнэ үү…».
 */
export function ChromePayButton({
  url,
  kind,
  label,
  onTap,
}: {
  url: string | null;
  kind: "movie" | "sub";
  label: string;
  onTap?: () => void;
}) {
  const [opening, setOpening] = useState(false);

  // Chrome-оос буцаж ирэхэд товч хэвийн байдалдаа орно
  useEffect(() => {
    if (!opening) return;
    const onVis = () => {
      if (document.visibilityState === "visible") setOpening(false);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [opening]);

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
        onTap?.();
        setOpening(true);
        watchChromeHandoff(url, kind);
      }}
    >
      {opening ? "Түр хүлээнэ үү…" : label}
    </a>
  );
}
