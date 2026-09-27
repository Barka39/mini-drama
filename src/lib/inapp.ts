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
// Тиймээс iPhone-ийн Meta дотоод хөтөчид худалдан авах цонх нээгдмэгц захиалгыг урьдчилан
// бэлдэж, «Төлбөр төлөх» товчийг шууд Chrome-ын холбоос болгоно — НЭГ дарахад Chrome нээгдэж
// Byl руу орно (эзний шаардлага: завсрын товч, нэмэлт бичиг байхгүй). Chrome байхгүй бол 5 сек-
// ийн дараа энэ цонхондоо Byl руу орно.
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

/**
 * Chrome (iOS)-д нээх хаяг. googlechromes:// нь Chrome-ын албан ёсны схем (https:// → googlechromes://).
 * Byl руу ШУУД биш, манай /pay?u=… хуудсаар дамжуулна: эзний iPhone дээр Chrome нээгдсэн
 * цорын ганц тохиолдол нь googlechromes://kinomandal.com/… байсан — яг тэр замыг давтана.
 * Chrome дотор /pay нь Byl-ийн хаягийг шалгаад тийш шилжүүлнэ.
 */
export function chromeUrl(payUrl: string): string {
  return `googlechromes://${window.location.host}/pay?u=${encodeURIComponent(payUrl)}`;
}

/** Chrome нээгдэхийг хүлээх хугацаа. Хэт богино бол удаан нээгдэж буй Chrome-г цуцалдаг. */
const CHROME_WAIT_MS = 5000;
/** Хожуу нээгдэлтийг ч тэмдэглэнэ */
const CHROME_LATE_MS = 20000;

/**
 * Chrome-ын холбоосыг ДАРАХ мөчид дуудна. Хуудас нуугдвал = Chrome нээгдсэн; хэрэглэгч буцаж
 * ирэхэд захиалгыг өөрөө шалгана. 5 секундэд нуугдаагүй бол (Chrome суугаагүй) энэ цонхондоо
 * Byl руу орно.
 */
export function watchChromeHandoff(url: string, kind: "movie" | "sub"): void {
  const started = Date.now();
  let left = false;
  const mark = () => {
    if (left) return;
    left = true;
    const sec = Math.min(99, Math.round((Date.now() - started) / 1000));
    track("iab_safari", `chrome-ok:${kind}:${sec}s`);
  };
  const onVis = () => {
    if (document.visibilityState === "hidden") mark();
  };
  document.addEventListener("visibilitychange", onVis);
  window.addEventListener("pagehide", mark);
  track("iab_gate", `chrome:${kind}`);

  window.setTimeout(() => {
    // Апп солигдоход таймер зогсдог — хугацаа хэтэрсэн бол Chrome-д очоод буцсан гэсэн үг
    if (!left && Date.now() - started > CHROME_WAIT_MS + 1500) mark();
    if (left) return;
    track("iab_retry", `chrome-no:${kind}`);
    // Хэмжилт илгээгдэж амжих хором өгнө (шууд шилжвэл хүсэлт тасардаг)
    window.setTimeout(() => {
      if (!left) window.location.href = url;
    }, 300);
  }, CHROME_WAIT_MS);
  window.setTimeout(() => {
    document.removeEventListener("visibilitychange", onVis);
    window.removeEventListener("pagehide", mark);
  }, CHROME_LATE_MS);
}

/** Зөвхөн Byl-ийн төлбөрийн хуудас (нээлттэй redirect болгохгүйн тулд) */
export const BYL_URL = /^https:\/\/byl\.mn\/h\/(checkout|invoice)\/\d+\/[A-Za-z0-9]{16,64}$/;
