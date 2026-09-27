import { useEffect, useState } from "react";
import { inAppName, isIOS, isMetaInApp } from "../lib/inapp";
import { track } from "../lib/track";

/**
 * /t/iab2 — эзний iPhone дээрх туршилт (2-р шат; /t/iab нь Byl-д өгсөн давтах хуудас тул хэвээр) (сайтаас холбоосгүй, нууц хуудас).
 *
 * 1-р шат (2026-09-27, эзний iPhone, Messenger): location.href / <a href> → банкны апп НЭЭГДСЭН,
 * window.open (Byl-ийн арга) → нээгдээгүй, x-safari-https (шууд) → юу ч болоогүй.
 *
 * 2-р шат (энэ хуудас): x-safari-аас бусад аргаар Safari (эсвэл өөр хөтөч) нээгдэх эсэх.
 * Нэг нь ажиллавал «Төлбөр төлөх» дарахад төлбөрийн хуудас өөрөө Safari-д нээгдэнэ (Byl-ийн
 * банкны товч Safari-д ажилладаг). Safari-д ирсэн эсэхийг ?from=safari&m=<арга>-аар баттай мэднэ
 * — хуудас нуугдсан эсэхээр таамаглахгүй (1-р шатанд тэр нь хуурамч ✓ өгч байсан).
 */

type Mech = { id: string; label: string; href: (host: string) => string; js?: boolean; note?: string };

const target = (host: string, m: string) => `${host}/t/iab2?from=safari&m=${m}`;

// Судалгаа (2026-09-27): com-apple-mobilesafari-tab, Shortcuts, татах (download) арга бүгд үхсэн.
// Үлдсэн, туршиж үзэх үнэтэй нь зөвхөн эдгээр.
const MECHS: Mech[] = [
  { id: "chrome", label: "1", href: (h) => `googlechromes://${target(h, "chrome")}`, note: "Chrome суусан бол" },
  { id: "s-wo", label: "2", href: (h) => `x-safari-https://${target(h, "s-wo")}`, js: true },
  { id: "s-meta", label: "3", href: () => `/api/esc?m=s-meta&mode=meta` },
  { id: "s-302", label: "4", href: () => `/api/esc?m=s-302` },
  { id: "ig", label: "5", href: (h) => `instagram://extbrowser/?url=${encodeURIComponent("https://" + target(h, "ig"))}`, note: "Instagram суусан бол" },
  { id: "s-http", label: "6", href: (h) => `x-safari-http://${target(h, "s-http")}` },
];

const KEY = "md-iab-test2";

export function IabTest2Page() {
  const params = new URLSearchParams(location.search);
  const arrived = params.get("from") === "safari" ? (params.get("m") ?? "?") : null;
  const arrivedLabel = MECHS.find((m) => m.id === arrived)?.label ?? "?";
  const browser = /CriOS/.test(navigator.userAgent) ? "Chrome" : isMetaInApp ? "Facebook дотор" : "Safari";
  const [tapped, setTapped] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(KEY) || "[]");
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (arrived) track("iab_safari", `t:arrived:${arrived}:${browser === "Facebook дотор" ? "fb" : browser}`.slice(0, 40));
  }, [arrived, browser]);

  function tap(m: Mech) {
    track("iab_retry", `t2:${m.id}:tap:${isIOS ? "ios" : "x"}${isMetaInApp ? "-fb" : ""}:${inAppName}`);
    setTapped((prev) => {
      const next = prev.includes(m.id) ? prev : [...prev, m.id];
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* */
      }
      return next;
    });
  }

  return (
    <div className="page" style={{ padding: "24px 16px", maxWidth: 520, margin: "0 auto" }}>
      <h2 style={{ marginTop: 0 }}>Туршилт 2</h2>

      {arrived ? (
        <div style={{ background: "#14361f", border: "1px solid #4ade80", borderRadius: 14, padding: 16, margin: "12px 0 20px" }}>
          <p style={{ fontSize: 22, color: "#4ade80", fontWeight: 800, margin: 0 }}>
            ✓ {arrivedLabel}-р товч ажиллалаа!
          </p>
          <p style={{ margin: "6px 0 0" }}>Одоо {browser} дээр нээгдсэн байна. Энэ дугаарыг надад хэлээрэй.</p>
        </div>
      ) : (
        <p className="muted" style={{ lineHeight: 1.5 }}>
          Товчнуудыг ээлжлэн дараарай. Safari нээгдвэл ногоон «✓ ажиллалаа» гэсэн бичиг гарна — тэр дугаарыг надад
          хэлээрэй. Юу ч болохгүй бол дараагийн товч руу. Асуулт гарч ирвэл «Нээх / Open» гэж дарна.
        </p>
      )}

      {MECHS.map((m) => (
        <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12, margin: "10px 0" }}>
          {m.js ? (
            <button
              className="btn btn-glass"
              style={{ flex: 1 }}
              onClick={() => {
                tap(m);
                // 2-р арга: товч дарах мөчид window.open (2026-03-д Facebook-т ажиллаж байсан гэх)
                window.open(m.href(location.host), "_blank");
              }}
            >
              {m.label}-р товч
            </button>
          ) : (
            <a className="btn btn-glass" style={{ flex: 1 }} href={m.href(location.host)} onClick={() => tap(m)}>
              {m.label}-р товч{m.note ? ` (${m.note})` : ""}
            </a>
          )}
          <span className="muted small" style={{ minWidth: 70, textAlign: "right" }}>
            {tapped.includes(m.id) ? "дарсан" : ""}
          </span>
        </div>
      ))}

      <p className="muted small" style={{ marginTop: 20, wordBreak: "break-all" }}>
        {isIOS ? "iPhone" : "iPhone биш"} · {browser}
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
          setTapped([]);
        }}
      >
        Дахин эхлэх
      </button>
    </div>
  );
}
