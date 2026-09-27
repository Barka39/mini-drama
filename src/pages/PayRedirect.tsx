import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChromePayLink } from "../components/ChromePayLink";
import { BYL_URL, needsChromeHandoff } from "../lib/inapp";

/**
 * /pay?u=<Byl төлбөрийн хаяг>
 *
 * 2026-09-27-ны хэдэн цагт ашиглагдсан хуучин туслах дэлгэцийн хаяг. Энгийн хөтөчид шууд
 * төлбөрийн хуудас руу шилжүүлнэ; iPhone-ийн Messenger дотор «Банкаа сонгож төлөх» (Chrome)
 * товч гаргана. Зөвхөн byl.mn-ийн төлбөрийн хаягийг зөвшөөрнө (хуурамч линк болгохгүй).
 */
export function PayRedirect() {
  const [params] = useSearchParams();
  const u = params.get("u") ?? "";
  const ok = BYL_URL.test(u);

  useEffect(() => {
    if (ok && !needsChromeHandoff) window.location.replace(u);
  }, [ok, u]);

  if (!ok) {
    return (
      <div className="page center">
        <p className="muted">Төлбөрийн линк буруу байна.</p>
        <Link className="btn btn-glass" to="/">
          Нүүр хуудас
        </Link>
      </div>
    );
  }
  if (needsChromeHandoff) {
    return (
      <div className="page center">
        <div className="modal pay-modal">
          <ChromePayLink url={u} kind="movie" />
        </div>
      </div>
    );
  }
  return (
    <div className="page center">
      <span className="pay-spinner" />
      <p className="muted small">Төлбөрийн хуудас руу шилжиж байна…</p>
    </div>
  );
}
