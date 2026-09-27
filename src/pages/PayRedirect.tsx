import { useEffect } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ChromePayButton } from "../components/ChromePayButton";
import { BYL_URL, bylCheckoutUrl, needsChromeHandoff } from "../lib/inapp";

/**
 * /pay?u=<Byl төлбөрийн хаяг>
 *
 * 2026-09-27-ны хэдэн цагт ашиглагдсан хуучин туслах дэлгэцийн хаяг. Энгийн хөтөчид шууд
 * төлбөрийн хуудас руу шилжүүлнэ; iPhone-ийн Messenger дотор «Төлбөр төлөх» (Chrome-д нээнэ)
 * товч гаргана. Зөвхөн byl.mn-ийн төлбөрийн хаягийг зөвшөөрнө (хуурамч линк болгохгүй).
 */
export function PayRedirect() {
  const [params] = useSearchParams();
  const { id, token } = useParams();
  // /pay/<дугаар>/<токен> (Chrome-д нээх энгийн хаяг) эсвэл хуучин /pay?u=<хаяг>
  const u = (id && token ? bylCheckoutUrl(id, token) : params.get("u")) ?? "";
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
          <ChromePayButton url={u} kind="movie" label="Төлбөр төлөх" />
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
