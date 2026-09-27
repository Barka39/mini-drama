// Facebook / Messenger / Instagram-ийн ДОТООД хөтөч (in-app browser), iPhone.
//
// Асуудал: Byl-ийн төлбөрийн хуудас банкны аппыг `window.open(deeplink,'_blank')`-аар нээдэг.
// iPhone-ийн Facebook/Messenger дотор энэ нь цагаан «q» хуудас гаргаж, апп нээгддэггүй.
//
// Эзний iPhone дээрх туршилт (2026-09-27, /t/iab, /t/iab2):
//   - location.href / <a href>="khanbank://" → банкны апп НЭЭГДСЭН; window.open → үгүй
//   - Safari руу гарах бүх арга (x-safari-https/http, 302, meta refresh, window.open,
//     instagram://extbrowser) → Facebook хаадаг, юу ч болоогүй
//   - googlechromes://… → Chrome НЭЭГДСЭН (Chrome суусан бол)
// Тиймээс iPhone-ийн Meta дотоод хөтөчид төлбөрийн хуудсыг эхлээд Chrome-д нээхийг оролдоно
// (Chrome дотор Byl-ийн банкны товч ажилладаг). Chrome байхгүй бол хэдхэн хормын дараа
// өмнөх шигээ Byl руу шууд орно — ямар ч нэмэлт дэлгэц, заавар, үг байхгүй.
//
// Жинхэнэ засвар нь Byl талд (window.open → тухайн цонхондоо нээх) — тэдэнд мэдэгдсэн.
// Android-д банкны апп ихэвчлэн нээгддэг — хөндөхгүй.

import { track } from "./track";

const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";

export const isIOS = /iPhone|iPad|iPod/i.test(ua);
/** Meta-гийн дотоод хөтөч (Facebook, Messenger, Instagram, Threads) */
export const isMetaInApp =
  /FBAN\/|FBAV\/|FB_IAB\/|FBIOS|FB4A|MessengerForiOS|Orca-Android/i.test(ua) ||
  /\bInstagram\b/i.test(ua) ||
  /\bBarcelona\b/.test(ua);

/** Chrome нээгдсэн эсэхийг хүлээх хугацаа (хуудас нуугдвал = апп солигдсон) */
const CHROME_WAIT_MS = 1800;

/**
 * Төлбөрийн хуудсыг нээнэ.
 * iPhone-ийн Meta дотоод хөтөчид эхлээд Chrome-д нээхийг оролдоно. Chrome нээгдвэл энэ
 * хуудас хэвээр үлдэж `onStayed()` дуудагдана (хүлээлтийн төлөв харуулж, буцаж ирэхэд
 * төлбөрийг өөрөө шалгана). Chrome байхгүй бол Byl руу шууд шилжинэ.
 */
export function openPayPage(url: string, kind: "movie" | "sub", onStayed: () => void): void {
  if (!(isIOS && isMetaInApp) || !/^https:\/\//.test(url)) {
    window.location.href = url;
    return;
  }

  let left = false;
  const onVis = () => {
    if (document.visibilityState === "hidden") left = true;
  };
  const onHide = () => {
    left = true;
  };
  document.addEventListener("visibilitychange", onVis);
  window.addEventListener("pagehide", onHide);

  track("iab_gate", `chrome:${kind}`);
  const started = Date.now();
  window.location.href = url.replace(/^https:\/\//, "googlechromes://");

  window.setTimeout(() => {
    document.removeEventListener("visibilitychange", onVis);
    window.removeEventListener("pagehide", onHide);
    // Апп солигдоход таймер зогсдог — хугацаа хэтэрсэн бол хэрэглэгч Chrome-д очоод буцсан гэсэн үг
    if (left || Date.now() - started > CHROME_WAIT_MS + 1500) {
      track("iab_safari", `chrome-ok:${kind}`);
      onStayed();
      return;
    }
    track("iab_retry", `chrome-no:${kind}`);
    window.location.href = url;
  }, CHROME_WAIT_MS);
}

/** Зөвхөн Byl-ийн төлбөрийн хуудас (нээлттэй redirect болгохгүйн тулд) */
export const BYL_URL = /^https:\/\/byl\.mn\/h\/(checkout|invoice)\/\d+\/[A-Za-z0-9]{16,64}$/;
