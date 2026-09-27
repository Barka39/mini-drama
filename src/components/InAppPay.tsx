import { useEffect, useState } from "react";
import { Copy, ExternalLink, MoreHorizontal, QrCode } from "lucide-react";
import { PATH_MODE } from "../lib/routing";
import { qrUrl, safariUrl } from "../lib/inapp";
import { track } from "../lib/track";

/**
 * iPhone-ийн Facebook/Messenger/Instagram дотоод хөтөчид Byl-ийн төлбөрийн хуудас руу
 * явуулахаас ӨМНӨ харуулах дэлгэц. Тэнд банкны апп нээгддэггүй (цагаан «q» хуудас) тул:
 *   1) «Safari-д нээж төлөх» — ЗААВАЛ хүний товшилтоор (автоматаар бол FB гацдаг)
 *   2) ⋯ → «Open in external browser» заавар — хаягийн мөрөнд /pay?u=… тавьсан тул
 *      Safari шууд төлбөрийн хуудас руу орно
 *   3) Линк хуулах · QR-аар төлөх (Byl-ийн албан ёсны QR горим)
 * Кино: Safari-д төлсний дараа Byl нэг удаагийн линкээр буцаана — кино Safari-д ч,
 * Facebook руу буцахад ч нээгдэнэ (буцаж ороход дэлгэц өөрөө шалгана).
 */
export function InAppPay({ url, kind, onBack }: { url: string; kind: "movie" | "sub"; onBack?: () => void }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    track("iab_gate");
    if (!PATH_MODE) return;
    // ⋯ → «Open in external browser» нь ОДООГИЙН хаягийг Safari-д нээдэг — түр зуур
    // төлбөрийн хаяг руу чиглүүлдэг /pay?u=… болгоно, цонх хаагдахад буцаана.
    const before = window.location.pathname + window.location.search + window.location.hash;
    window.history.replaceState(window.history.state, "", `/pay?u=${encodeURIComponent(url)}`);
    return () => {
      window.history.replaceState(window.history.state, "", before);
    };
  }, [url]);

  function copy() {
    track("iab_copy");
    const done = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    };
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(url).then(done, () => window.prompt("Линкийг хуулна уу:", url));
    } else {
      window.prompt("Линкийг хуулна уу:", url);
    }
  }

  return (
    <div className="iab">
      <div className="iab-icon">
        <ExternalLink size={24} />
      </div>
      <h3 className="iab-title">Facebook дотроос банкны апп нээгддэггүй</h3>
      <p className="iab-sub">Төлбөрөө Safari дээр хийнэ үү — нэг товч.</p>

      <button
        className="btn btn-primary btn-wide"
        onClick={() => {
          track("iab_safari");
          window.open(safariUrl(url), "_blank");
        }}
      >
        Safari-д нээж төлөх
      </button>

      <div className="iab-steps">
        <p className="iab-steps-h">Нээгдэхгүй бол:</p>
        <ol>
          <li>
            Дээд буланд байгаа <MoreHorizontal size={16} className="iab-inline" /> (гурван цэг) дээр дарна
          </li>
          <li>
            <strong>«Open in external browser»</strong> / «Safari-д нээх»-ийг сонгоно
          </li>
          <li>Банкаа сонгоод төлнө</li>
        </ol>
      </div>

      <div className="iab-row">
        <a className="btn btn-glass" href={safariUrl(url)} onClick={() => track("iab_retry")}>
          Дахин оролдох
        </a>
        <button className="btn btn-glass" onClick={copy}>
          <Copy size={16} /> {copied ? "Хуулагдлаа" : "Линк хуулах"}
        </button>
      </div>
      {copied && <p className="iab-hint">Safari-г нээгээд хаягийн мөрөнд буулгана уу.</p>}

      <button
        className="btn btn-ghost btn-wide"
        onClick={() => {
          track("iab_qr");
          window.location.href = qrUrl(url);
        }}
      >
        <QrCode size={17} /> QR-аар төлөх (өөр утсаар уншуулах)
      </button>

      <p className="iab-note">
        {kind === "movie"
          ? "Төлбөр орсны дараа кино автоматаар нээгдэнэ — Safari дээр ч, Facebook руу буцсан ч."
          : "Төлбөр орсны дараа Facebook руугаа буцаж орход сарын эрх тань идэвхтэй болсон байна."}
      </p>
      {onBack && (
        <button className="btn btn-ghost" onClick={onBack}>
          Буцах
        </button>
      )}
    </div>
  );
}
