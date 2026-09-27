import { useEffect, useState, type ReactNode } from "react";
import { isIOS, isMetaInApp } from "../lib/inapp";
import { track } from "../lib/track";

/**
 * /t/iab — эзний iPhone дээрх 1 минутын туршилт (сайтаас холбоосгүй, нууц хуудас).
 *
 * Асуулт: Facebook/Messenger-ийн дотоод хөтөч аль аргаар өөр апп нээхийг зөвшөөрдөг вэ?
 * Byl банкны аппыг `window.open` (шинэ цонх)-оор нээдэг — энэ нь цагаан «q» хуудас гаргадаг.
 * Өмнөх «Safari-д нээх» товч маань ч мөн `window.open` ашигласан байсан тул адилхан унасан.
 * Тэр цонхондоо шилжих (`location.href`) эсвэл энгийн холбоос (`<a href>`) ажилладаг эсэхийг
 * зөвхөн бодит утас хэлж чадна. Хариу:
 *   Safari (1, 2) ажиллавал → «Төлбөр төлөх» төлбөрийг өөрөө Safari-д нээнэ (бидний тал, өнөөдөр)
 *   Банк (3, 4) ажиллавал → Byl `window.open`-оо солих хэрэгтэй (Byl-д хэлэх нотолгоо)
 *
 * Апп нээгдсэн эсэхийг хуудас нуугдсанаар (visibilitychange) тогтооно.
 */

type Mech = "s-loc" | "s-link" | "b-loc" | "b-link" | "b-open";
type Result = "ok" | "no";

const KEY = "md-iab-test";
const TRY_KEY = "md-iab-try";

const safariTarget = () => `x-safari-https://${location.host}/t/iab?from=safari`;
const BANK = "khanbank://";

const LABEL: Record<Mech, string> = {
  "s-loc": "1. Safari нээх (A)",
  "s-link": "2. Safari нээх (B)",
  "b-loc": "3. Хаан банк нээх (A)",
  "b-link": "4. Хаан банк нээх (B)",
  "b-open": "5. Хаан банк нээх (Byl-ийн арга)",
};

function load(): Partial<Record<Mech, Result>> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}

export function IabTestPage() {
  const [res, setRes] = useState<Partial<Record<Mech, Result>>>(load);
  const fromSafari = new URLSearchParams(location.search).get("from") === "safari";

  const save = (m: Mech, r: Result) => {
    setRes((prev) => {
      const next = { ...prev, [m]: r };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* хадгалахгүй бол зүгээр */
      }
      return next;
    });
    track("iab_retry", `t:${m}:${r}:${isIOS ? "ios" : "x"}${isMetaInApp ? "-fb" : ""}`);
  };

  useEffect(() => {
    if (fromSafari) track("iab_safari", "t:arrived-in-safari");
    // Өмнөх оролдлого хуудсыг солиод (цагаан хуудас) буцаж ирсэн бол — ажиллаагүй
    try {
      const t = localStorage.getItem(TRY_KEY) as Mech | null;
      if (t) {
        localStorage.removeItem(TRY_KEY);
        if (!load()[t]) save(t, "no");
      }
    } catch {
      /* */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function attempt(m: Mech, go: () => void) {
    let hidden = false;
    const onVis = () => {
      if (document.visibilityState === "hidden") hidden = true;
    };
    document.addEventListener("visibilitychange", onVis);
    try {
      localStorage.setItem(TRY_KEY, m);
    } catch {
      /* */
    }
    go();
    window.setTimeout(() => {
      document.removeEventListener("visibilitychange", onVis);
      try {
        localStorage.removeItem(TRY_KEY);
      } catch {
        /* */
      }
      save(m, hidden ? "ok" : "no");
    }, 2500);
  }

  const mark = (m: Mech) =>
    res[m] === "ok" ? (
      <b style={{ color: "#4ade80" }}>✓ нээгдсэн</b>
    ) : res[m] === "no" ? (
      <b style={{ color: "#f87171" }}>✗ нээгдээгүй</b>
    ) : null;

  const row = (m: Mech, el: ReactNode) => (
    <div key={m} style={{ display: "flex", alignItems: "center", gap: 12, margin: "10px 0" }}>
      <div style={{ flex: 1 }}>{el}</div>
      <div style={{ minWidth: 110, textAlign: "right" }}>{mark(m)}</div>
    </div>
  );

  return (
    <div className="page" style={{ padding: "24px 16px", maxWidth: 520, margin: "0 auto" }}>
      <h2 style={{ marginTop: 0 }}>Туршилт</h2>
      {fromSafari ? (
        <p style={{ fontSize: 20, color: "#4ade80", fontWeight: 700 }}>✓ Safari нээгдлээ! Энэ хуудсыг зурагдаад явуулаарай.</p>
      ) : (
        <p className="muted small">
          Товч бүрийг ээлжлэн дараад, апп нээгдвэл буцаж энэ хуудас руу ирээрэй. Цагаан хуудас гарвал зүүн дээд
          буланд байгаа сумаар буцна. Бүгдийг дарж дууссаны дараа энэ хуудсыг зурагдаад явуулаарай.
        </p>
      )}

      {row(
        "s-loc",
        <button className="btn btn-glass" style={{ width: "100%" }} onClick={() => attempt("s-loc", () => (location.href = safariTarget()))}>
          {LABEL["s-loc"]}
        </button>,
      )}
      {row(
        "s-link",
        <a className="btn btn-glass" style={{ width: "100%" }} href={safariTarget()} onClick={() => attempt("s-link", () => undefined)}>
          {LABEL["s-link"]}
        </a>,
      )}
      {row(
        "b-loc",
        <button className="btn btn-glass" style={{ width: "100%" }} onClick={() => attempt("b-loc", () => (location.href = BANK))}>
          {LABEL["b-loc"]}
        </button>,
      )}
      {row(
        "b-link",
        <a className="btn btn-glass" style={{ width: "100%" }} href={BANK} onClick={() => attempt("b-link", () => undefined)}>
          {LABEL["b-link"]}
        </a>,
      )}
      {row(
        "b-open",
        <button className="btn btn-glass" style={{ width: "100%" }} onClick={() => attempt("b-open", () => window.open(BANK, "_blank"))}>
          {LABEL["b-open"]}
        </button>,
      )}

      <p className="muted small" style={{ marginTop: 20, wordBreak: "break-all" }}>
        {isIOS ? "iPhone" : "iPhone биш"} · {isMetaInApp ? "Facebook/Messenger дотор" : "энгийн хөтөч"}
        <br />
        {navigator.userAgent}
      </p>
      <button
        className="btn btn-glass small"
        onClick={() => {
          try {
            localStorage.removeItem(KEY);
          } catch {
            /* */
          }
          setRes({});
        }}
      >
        Дахин эхлэх
      </button>
    </div>
  );
}
