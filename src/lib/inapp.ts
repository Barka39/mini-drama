// Facebook / Messenger / Instagram-ийн ДОТООД хөтөч (in-app browser).
//
// Асуудал (2026-09-27, эзний зураг): iPhone-ийн Facebook/Messenger дотор Byl-ийн төлбөрийн
// хуудсанд банк сонгоход Byl `window.open("khanbank://…")` хийдэг — дотоод хөтөч түүнийг
// хуудас болгон ачаалж ЦАГААН «q» хуудас гаргадаг, банкны апп нээгддэггүй. Byl-ийн хуудсыг
// бид өөрчилж чадахгүй тул iPhone-ийн дотоод хөтөчид Byl руу явуулахаас ӨМНӨ туслах дэлгэц
// харуулж Safari руу гаргана (эсвэл QR-аар төлүүлнэ).
//
// Android-д банкны апп ихэвчлэн нээгддэг (Byl-ийн мэдээлэл) — одоохондоо хөндөхгүй.

const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";

export const isIOS = /iPhone|iPad|iPod/i.test(ua);
export const isInstagram = /\bInstagram\b/i.test(ua);
/** Meta-гийн дотоод хөтөч (Facebook, Messenger, Instagram, Threads) */
export const isMetaInApp =
  /FBAN\/|FBAV\/|FB_IAB\/|FBIOS|FB4A|MessengerForiOS|Orca-Android/i.test(ua) || isInstagram || /\bBarcelona\b/.test(ua);

/** Туршилтын шилжүүлэгч: ?iab=1 — ямар ч хөтөч дээр дэлгэцийг харуулна */
function forced(): boolean {
  try {
    return new URLSearchParams(window.location.search).get("iab") === "1";
  } catch {
    return false;
  }
}

/** Byl руу шууд явуулахын оронд туслах дэлгэц харуулах уу */
export function needsInAppGate(): boolean {
  return (isIOS && isMetaInApp) || forced();
}

/** Зөвхөн Byl-ийн төлбөрийн хуудас (нээлттэй redirect болгохгүйн тулд) */
export const BYL_URL = /^https:\/\/byl\.mn\/h\/(checkout|invoice)\/\d+\/[A-Za-z0-9]{16,64}$/;

/** Safari-д нээх холбоос: Facebook/Messenger → x-safari-https, Instagram → өөрийн схем */
export function safariUrl(u: string): string {
  return isInstagram
    ? `instagram://extbrowser/?url=${encodeURIComponent(u)}`
    : u.replace(/^https:\/\//, "x-safari-https://");
}

/** Byl-ийн албан ёсны QR горим (банкны товчгүй, том QR, төлбөрийг өөрөө шалгана) */
export function qrUrl(u: string): string {
  return `${u}?view=only-qr&theme=dark`;
}
