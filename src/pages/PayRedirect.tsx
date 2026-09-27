import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { BYL_URL } from "../lib/inapp";

/**
 * /pay?u=<Byl төлбөрийн хаяг>
 *
 * 2026-09-27-ны хэдэн цагт ашиглагдсан хуучин хаяг — шууд төлбөрийн хуудас руу шилжүүлнэ.
 * Зөвхөн byl.mn-ийн төлбөрийн хаягийг зөвшөөрнө (өөр сайт руу чиглүүлэх хуурамч линк болгохгүй).
 */
export function PayRedirect() {
  const [params] = useSearchParams();
  const u = params.get("u") ?? "";
  const ok = BYL_URL.test(u);

  useEffect(() => {
    if (ok) window.location.replace(u);
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
  return (
    <div className="page center">
      <span className="pay-spinner" />
      <p className="muted small">Төлбөрийн хуудас руу шилжиж байна…</p>
    </div>
  );
}
