// Чиглүүлэлтийн горим. Хаяг «#»-гүй (/movie/<id>) — хуулж явуулсан линкэнд киноны
// нэр, зураг гарна (сервер тал кино бүрийн хуудсыг өгнө, tools/make-shells.mjs).
// Зөвхөн GitHub-ийн нөөц хаяг (дэд зам /mini-drama/) #/... хэвээр — домэйн солигдсон
// ч (.env-ийн SITE_URL) код засах шаардлагагүй.
// index.html-ийн эхний script-тэй ИЖИЛ нөхцөл байх ёстой.
export const PATH_MODE =
  typeof window !== "undefined" &&
  !/\.github\.io$/.test(window.location.hostname);

/** QPay-ээс буцах хаяг (сервер «#/...» хэлбэр хүлээдэг; #-гүй хаягт index.html хөрвүүлнэ) */
export function currentRouteAsHash(): string {
  // Зөвхөн зам (+ ?src=): Facebook-ийн fbclid зэрэг урт хавсралт сервер талын
  // шалгалтыг (200 тэмдэгт) давж, хүнийг нүүр хуудас руу буцаадаг байв.
  if (PATH_MODE) {
    const src = new URLSearchParams(window.location.search).get("src");
    return "#" + window.location.pathname + (src && /^[\w-]{1,20}$/.test(src) ? `?src=${src}` : "");
  }
  return window.location.hash || "#/";
}

/**
 * #-гүй горимд нээлттэй tab руу хуучин «#/...» линк орж ирвэл (жишээ нь нүүр хуудас
 * нээлттэй байхад /#/u/<токен>) хөтөч хуудсыг дахин ачаалдаггүй — зөвхөн hash солигдоно.
 * Тэр үед index.html-тэй ижлээр замд хөрвүүлж, чиглүүлэгчид мэдэгдэнэ.
 */
export function watchLegacyHashLinks() {
  if (!PATH_MODE) return;
  window.addEventListener("hashchange", () => {
    if (window.location.hash.indexOf("#/") !== 0) return;
    const r = window.location.hash.slice(1);
    const q = r.indexOf("?");
    const path = q < 0 ? r : r.slice(0, q);
    const query = q < 0 ? "" : r.slice(q);
    window.history.replaceState(null, "", path + query);
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
}
