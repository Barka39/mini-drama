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
// нээнэ; Chrome дотор Byl-ийн банкны товч ажилладаг). Chrome нээгдэхгүй бол «Chrome байхгүй
// бол энд дарж төлөх» холбоос гарна (автоматаар шилжүүлэхгүй).
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

/** Энэ хугацаанд хуудас нуугдаагүй бол «Chrome байхгүй бол энд» холбоос гаргана */
const CHROME_WAIT_MS = 3000;
/** Хожуу нээгдэлтийг ч тэмдэглэнэ (Facebook Chrome-г хэдэн секунд саатуулж нээдэг эсэх) */
const CHROME_LATE_MS = 20000;

/**
 * Chrome-ын холбоосыг ДАРАХ мөчид дуудна. Хуудас нуугдвал = Chrome нээгдсэн; хэрэглэгч буцаж
 * ирэхэд захиалгыг өөрөө шалгана. Нуугдаагүй бол `onNoChrome()` — дэлгэц «Chrome байхгүй
 * бол энд» холбоос гаргана.
 *
 * АВТОМАТААР Byl руу ШИЛЖИХГҮЙ (2026-09-27): 1.8 сек-ийн дараа шилжих нь эзний iPhone дээр
 * Chrome-ын нээгдэлтийг цуцалж байсан бололтой — туршилтын хуудсанд (дараа нь юу ч хийдэггүй)
 * Chrome нээгдсэн, төлбөрийн урсгалд (шилждэг) нээгдээгүй.
 */
export function watchChromeHandoff(kind: "movie" | "sub", onNoChrome: () => void): void {
  const started = Date.now();
  let left = false;
  let reported = false;
  const mark = () => {
    if (left) return;
    left = true;
    const sec = Math.round((Date.now() - started) / 1000);
    track("iab_safari", `chrome-ok:${kind}:${reported ? "late" : "fast"}${Math.min(sec, 99)}`);
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
    reported = true;
    track("iab_retry", `chrome-no:${kind}`);
    onNoChrome();
  }, CHROME_WAIT_MS);
  window.setTimeout(() => {
    document.removeEventListener("visibilitychange", onVis);
    window.removeEventListener("pagehide", mark);
  }, CHROME_LATE_MS);
}

/** Зөвхөн Byl-ийн төлбөрийн хуудас (нээлттэй redirect болгохгүйн тулд) */
export const BYL_URL = /^https:\/\/byl\.mn\/h\/(checkout|invoice)\/\d+\/[A-Za-z0-9]{16,64}$/;
