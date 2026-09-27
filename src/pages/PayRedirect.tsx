import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { InAppPay } from "../components/InAppPay";
import { BYL_URL, needsInAppGate } from "../lib/inapp";

/**
 * /pay?u=<Byl төлбөрийн хаяг>
 *
 * Facebook/Messenger-ийн дотоод хөтчийн «⋯ → Open in external browser» нь ОДООГИЙН хаягийг
 * Safari-д нээдэг. Туслах дэлгэц нээлттэй байхад хаяг нь энэ /pay болсон байдаг тул Safari
 * шууд Byl-ийн төлбөрийн хуудас руу орно. Зөвхөн byl.mn-ийн төлбөрийн хаягийг зөвшөөрнө
 * (өөр сайт руу чиглүүлэх хуурамч линк болгож ашиглах боломжгүй).
 */
export function PayRedirect() {
  const [params] = useSearchParams();
  const u = params.get("u") ?? "";
  const ok = BYL_URL.test(u);
  const gate = ok && needsInAppGate();

  useEffect(() => {
    if (ok && !gate) window.location.replace(u);
  }, [ok, gate, u]);

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
  if (gate) {
    return (
      <div className="page center">
        <div className="modal pay-modal iab-page">
          <InAppPay url={u} kind="movie" />
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
