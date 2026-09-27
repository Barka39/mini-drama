import { useEffect, useState } from "react";
import { ArrowUp, Compass, Copy, Globe, MoreHorizontal, Smartphone } from "lucide-react";
import { inAppName } from "../lib/inapp";
import { track } from "../lib/track";

/**
 * iPhone-ийн Facebook/Messenger/Instagram дотор төлбөрийн цонхны дээд талд гарах ТОМ заавар.
 *
 * Эзний шийдвэр (2026-09-27): Facebook апп дотроос банкны апп ч, Safari/Chrome ч автоматаар
 * нээгддэггүй (бодит утсан дээр батлагдсан) — тиймээс хүнд «Safari эсвэл Chrome-д нээгээгүй
 * бол төлбөр ажиллахгүй» гэдгийг нүдэнд харагдахаар, ойлгомжтой хэлнэ. Баруун дээд буланд
 * байгаа ⋯ товч руу сум заана. Safari-д нээгдэхэд худалдан авах цонх өөрөө нээгдсэн байна
 * (хаяганд ?buy=<кино> / ?vip=1 — App.tsx).
 *
 * «Chrome-оор нээх»: googlechromes://<сайт><chromePath> — эзний iPhone дээр Messenger-ээс Chrome
 * нээгдсэн (Facebook апп-аас нээгдээгүй). Автоматаар өөр тийш шилжүүлэхгүй — нээгдэхгүй бол
 * хүн дээрх алхмаар Safari-д нээнэ.
 */
export function InAppGuide({ kind, chromePath }: { kind: "movie" | "sub"; chromePath: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    track("iab_gate", `guide:${kind}:${inAppName}`);
  }, [kind]);

  function copyLink() {
    track("iab_copy", `guide:${kind}:${inAppName}`);
    void navigator.clipboard?.writeText(window.location.href).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    });
  }

  return (
    <>
      {/* ⋯ товч руу заасан сум — апп-ын хөтчийн баруун дээд буланд байдаг */}
      <div className="iab-arrow" aria-hidden="true">
        <ArrowUp size={30} strokeWidth={3} />
        <span>
          <MoreHorizontal size={18} strokeWidth={3} />
        </span>
      </div>

      <div className="iab-guide" role="note">
        <div className="iab-guide-head">
          <Smartphone size={22} />
          <span>iPhone хэрэглэгч анхаараарай</span>
        </div>
        <p className="iab-guide-title">
          Төлбөр төлөхийн тулд сайтаа <strong>Safari</strong> эсвэл <strong>Chrome</strong>-д нээнэ үү
        </p>
        <p className="iab-guide-why">
          Facebook, Messenger дотроос банкны апп нээгддэггүй тул энд төлбөр ажиллахгүй.
        </p>
        <ol className="iab-guide-steps">
          <li>
            Дэлгэцийн <strong>баруун дээд</strong> буланд байгаа{" "}
            <span className="iab-key">
              <MoreHorizontal size={16} strokeWidth={3} />
            </span>{" "}
            товчийг дарна
          </li>
          <li>
            <strong>
              <Compass size={15} className="iab-inline-icon" /> «Safari-д нээх»
            </strong>{" "}
            (<em>Open in Safari</em> / <em>Open in external browser</em>) гэснийг сонгоно
          </li>
          <li>
            Нээгдсэн хуудсан дээр <strong>«Төлбөр төлөх»</strong> дарж банкаа сонгоно
          </li>
        </ol>
        <a
          className="btn btn-glass iab-guide-copy"
          href={`googlechromes://${window.location.host}${chromePath}`}
          onClick={() => track("iab_retry", `guide-chrome:${kind}:${inAppName}`)}
        >
          <Globe size={16} /> Chrome байгаа бол: Chrome-оор нээх
        </a>
        <button className="btn btn-glass iab-guide-copy" onClick={copyLink}>
          <Copy size={16} /> {copied ? "Хуулагдлаа — Safari-д буулгана уу" : "Эсвэл линк хуулаад Safari-д буулгах"}
        </button>
      </div>
    </>
  );
}
