// Facebook / Messenger / Instagram-ийн ДОТООД хөтөч (in-app browser), iPhone.
//
// Асуудал: Byl-ийн төлбөрийн хуудас банкны аппыг `window.open(deeplink,'_blank')`-аар нээдэг.
// iPhone-ийн Facebook/Messenger дотор энэ нь цагаан «q» хуудас гаргаж, апп нээгддэггүй.
//
// Эзний iPhone дээрх туршилт (2026-09-27):
//   - тухайн цонхондоо нээх (`location.href` / `<a href>`="khanbank://") → банкны апп НЭЭГДДЭГ;
//     Byl-ийн `window.open` → үгүй. Жинхэнэ засвар нь Byl талд (тэдэнд мэдэгдсэн) эсвэл QPay-тэй
//     шууд гэрээ (төлбөрийн код авч банкны товчийг өөрсдөө гаргах).
//   - Safari руу гаргах бүх арга (x-safari, 302, meta refresh, window.open) → Facebook хаадаг.
//   - googlechromes:// → Messenger-ээс Chrome НЭЭГДСЭН, Facebook апп-аас (FBIOS) нээгдээгүй;
//     төлбөрийн урсгалд (захиалга бэлдээд Chrome-д Byl нээх) 4 хувилбар бүгд бүтэлгүйтэв.
// Эзний шийдвэр: iPhone-ийн Facebook/Messenger-т төлбөрийн товч харуулахгүй, «Safari эсвэл
// Chrome-д нээнэ үү» гэсэн ТОМ заавар харуулна (InAppGuide).
// Android-д банкны апп ихэвчлэн нээгддэг — хөндөхгүй.

const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";

export const isIOS = /iPhone|iPad|iPod/i.test(ua);
/** Meta-гийн дотоод хөтөч (Facebook, Messenger, Instagram, Threads) */
export const isMetaInApp =
  /FBAN\/|FBAV\/|FB_IAB\/|FBIOS|FB4A|MessengerForiOS|Orca-Android/i.test(ua) ||
  /\bInstagram\b/i.test(ua) ||
  /\bBarcelona\b/.test(ua);

/**
 * Аль апп-ын дотоод хөтөч вэ (хэмжилтэд): «MessengerForiOS», «FBIOS», «IG» … Facebook апп болон
 * Messenger апп-ын дотоод хөтөч Chrome руу гаргах эсэх нь ялгаатай (2026-09-27).
 */
export const inAppName = (/FBAN\/(\w+)/.exec(ua)?.[1] ?? (/\bInstagram\b/i.test(ua) ? "IG" : "web")).slice(0, 16);

/** Туршилт: ?iab=1 — ямар ч хөтөч дээр iPhone Messenger-ийн урсгалыг харуулна */
function forced(): boolean {
  try {
    return new URLSearchParams(window.location.search).get("iab") === "1";
  } catch {
    return false;
  }
}

/** iPhone-ийн Meta дотоод хөтөч: төлбөрийн цонхонд «Safari-д нээнэ үү» том заавар харуулна */
export const needsBrowserGuide = (isIOS && isMetaInApp) || forced();

/**
 * Safari-д нээгдэхэд худалдан авах цонх өөрөө нээгдэх тэмдэг (?buy=<кино> / ?vip=1).
 * ⋯ → «Safari-д нээх» нь ОДООГИЙН хаягийг нээдэг тул цонх нээлттэй байхад хаягт нэмнэ.
 */
export function markModalInUrl(key: "buy" | "vip", value: string | null): void {
  try {
    const u = new URL(window.location.href);
    if (value) u.searchParams.set(key, value);
    else u.searchParams.delete(key);
    if (u.href !== window.location.href) window.history.replaceState(window.history.state, "", u.href);
  } catch {
    /* хаяг солихгүй бол зүгээр */
  }
}

/** Зөвхөн Byl-ийн төлбөрийн хуудас (нээлттэй redirect болгохгүйн тулд) */
export const BYL_URL = /^https:\/\/byl\.mn\/h\/(checkout|invoice)\/\d+\/[A-Za-z0-9]{16,64}$/;
