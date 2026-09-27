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
//   - гэхдээ зөвхөн ХҮН ӨӨРӨӨ ДАРВАЛ: хэдэн секундын дараах автомат шилжилтийг хаадаг
// Тиймээс iPhone-ийн Meta дотоод хөтөчид «Төлбөр төлөх» → «Банкаа сонгож төлөх» (Chrome-д
// нээнэ; Chrome дотор Byl-ийн банкны товч ажилладаг). Chrome байхгүй бол хэдхэн хормын
// дараа өмнөх шигээ Byl руу орно.
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

/** Туршилт: ?iab=1 — ямар ч хөтөч дээр iPhone Messenger-ийн урсгалыг харуулна */
function forced(): boolean {
  try {
    return new URLSearchParams(window.location.search).get("iab") === "1";
  } catch {
    return false;
  }
}

/**
 * iPhone-ийн Meta дотоод хөтөч: төлбөрийн хуудсыг Chrome-д нээх товч харуулах уу.
 *
 * ЗААВАЛ ХҮН ӨӨРӨӨ ДАРСАН холбоосоор (2026-09-27): «Төлбөр төлөх» → захиалга үүсэх хооронд
 * хэдэн секунд өнгөрөхөд Facebook «хүн дарсан» гэж тооцохоо больж googlechromes://-ийг
 * хаадаг (эзний iPhone: оролдлого бүртгэгдсэн ч Chrome нээгдээгүй). Тиймээс захиалга бэлэн
 * болсны дараа <a href="googlechromes://…"> товч гаргаж хүнээр дарагдана.
 */
export const needsChromeHandoff = (isIOS && isMetaInApp) || forced();

/** Chrome (iOS)-д нээх хаяг: https:// → googlechromes:// (Chrome-ын албан ёсны схем) */
export function chromeUrl(url: string): string {
  return url.replace(/^https:\/\//, "googlechromes://");
}

/** Chrome нээгдсэн эсэхийг хүлээх хугацаа (хуудас нуугдвал = апп солигдсон) */
const CHROME_WAIT_MS = 1800;

/**
 * Chrome-ын холбоосыг ДАРАХ мөчид дуудна. Chrome нээгдвэл (хуудас нуугдвал) юу ч хийхгүй —
 * хэрэглэгч буцаж ирэхэд захиалгыг өөрөө шалгана. Chrome суугаагүй бол хэдхэн хормын
 * дараа Byl-ийн хуудас руу энэ цонхондоо шилжинэ.
 */
export function watchChromeHandoff(url: string, kind: "movie" | "sub"): void {
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

  window.setTimeout(() => {
    document.removeEventListener("visibilitychange", onVis);
    window.removeEventListener("pagehide", onHide);
    // Апп солигдоход таймер зогсдог — хугацаа хэтэрсэн бол хэрэглэгч Chrome-д очоод буцсан гэсэн үг
    if (left || Date.now() - started > CHROME_WAIT_MS + 1500) {
      track("iab_safari", `chrome-ok:${kind}`);
      return;
    }
    track("iab_retry", `chrome-no:${kind}`);
    // Хэмжилт илгээгдэж амжих хором өгнө (шууд шилжвэл хүсэлт тасардаг)
    window.setTimeout(() => {
      window.location.href = url;
    }, 250);
  }, CHROME_WAIT_MS);
}

/** Зөвхөн Byl-ийн төлбөрийн хуудас (нээлттэй redirect болгохгүйн тулд) */
export const BYL_URL = /^https:\/\/byl\.mn\/h\/(checkout|invoice)\/\d+\/[A-Za-z0-9]{16,64}$/;
