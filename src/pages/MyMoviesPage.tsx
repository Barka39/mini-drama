import { useMemo } from "react";
import { Link } from "react-router-dom";
import { formatPrice } from "../data/catalog";
import { buyStatus, useAppState } from "../lib/store";
import { useCatalog } from "../lib/seriesAdmin";
import { openAuth, openPurchase } from "../lib/ui";
import { AccountBadge } from "../components/AccountBadge";

// Худалдаж авсан кинонуудаа олох тусдаа хэсэг — өмнө нь тэднийг каталогоос
// хайж олох ёстой байсан.
export function MyMoviesPage() {
  const s = useAppState();
  const catalog = useCatalog();

  const owned = useMemo(
    () => catalog.filter((x) => buyStatus(s, x.id) === "owned"),
    [catalog, s],
  );
  const pending = useMemo(
    () => catalog.filter((x) => buyStatus(s, x.id) === "pending"),
    [catalog, s],
  );
  const watching = useMemo(
    () => catalog.filter((x) => s.progress[x.id] && buyStatus(s, x.id) !== "owned"),
    [catalog, s],
  );

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">Миний кинонууд</div>
        <AccountBadge />
      </header>

      {!s.signedIn && (
        <section className="empty-block">
          <p className="muted">
            Худалдаж авсан кинонуудаа харахын тулд утасны дугаараараа нэвтэрнэ үү.
          </p>
          <button className="btn btn-primary" onClick={openAuth}>
            Нэвтрэх / Бүртгүүлэх
          </button>
        </section>
      )}

      {pending.length > 0 && (
        <section className="my-block">
          <h2 className="row-title">⏳ Төлбөр хүлээгдэж байна</h2>
          {pending.map((x) => (
            <button key={x.id} className="my-row" onClick={() => openPurchase(x.id)}>
              <img src={x.poster} alt="" />
              <span className="my-row-text">
                <strong>{x.title}</strong>
                <span className="muted small">Шилжүүлгийн мэдээлэл харах →</span>
              </span>
            </button>
          ))}
        </section>
      )}

      {owned.length > 0 && (
        <section className="my-block">
          <h2 className="row-title">✅ Нээлттэй кинонууд</h2>
          {owned.map((x) => {
            const at = s.progress[x.id] ?? 1;
            return (
              <Link key={x.id} to={`/watch/${x.id}/${at}`} className="my-row">
                <img src={x.poster} alt="" />
                <span className="my-row-text">
                  <strong>{x.title}</strong>
                  <span className="muted small">
                    {at > 1 ? `${at}/${x.episodes.length} анги · үргэлжлүүлэх` : "Үзэж эхлэх"}
                  </span>
                </span>
              </Link>
            );
          })}
        </section>
      )}

      {watching.length > 0 && (
        <section className="my-block">
          <h2 className="row-title">👀 Үзэж эхэлсэн</h2>
          {watching.map((x) => {
            const at = s.progress[x.id] ?? 1;
            return (
              <Link key={x.id} to={`/watch/${x.id}/${at}`} className="my-row">
                <img src={x.poster} alt="" />
                <span className="my-row-text">
                  <strong>{x.title}</strong>
                  <span className="muted small">
                    {at}/{x.episodes.length} анги ·{" "}
                    {x.price > 0 ? `бүтэн кино ${formatPrice(x.price)}` : "үнэгүй"}
                  </span>
                </span>
              </Link>
            );
          })}
        </section>
      )}

      {s.signedIn && owned.length === 0 && pending.length === 0 && watching.length === 0 && (
        <section className="empty-block">
          <p className="muted">Одоогоор кино алга.</p>
          <Link className="btn btn-primary" to="/">
            Кино сонгох
          </Link>
        </section>
      )}
    </div>
  );
}
