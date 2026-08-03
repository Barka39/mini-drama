import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { allCategories, formatPrice, seriesCategories } from "../data/catalog";
import { buyStatus, signOut, useAppState } from "../lib/store";
import { useCatalog } from "../lib/seriesAdmin";
import { AccountBadge } from "../components/AccountBadge";

export function Home() {
  const s = useAppState();
  const catalog = useCatalog();
  const [cat, setCat] = useState<string | null>(null);

  const categories = useMemo(() => allCategories(catalog), [catalog]);
  const shown = useMemo(
    () => (cat ? catalog.filter((x) => seriesCategories(x).includes(cat)) : catalog),
    [cat, catalog],
  );

  // Эхэлсэн мөртлөө дуусгаагүй кинонууд — буцаж ирэх гол шалтгаан
  const continueList = useMemo(
    () =>
      catalog
        .filter((x) => {
          const at = s.progress[x.id];
          return at && at > 1 && at < x.episodes.length;
        })
        .slice(0, 6),
    [catalog, s.progress],
  );

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">▶</span> Кино Мандал
        </div>
        <AccountBadge />
      </header>

      <section className="hero">
        <h1>Богино ангитай драм, монголоор</h1>
        <p>Эхний минутууд үнэгүй · Нэг удаа төлөөд дуустал үзнэ · Утсандаа шууд үз</p>
      </section>

      {continueList.length > 0 && (
        <section className="row-block">
          <h2 className="row-title">▶ Үргэлжлүүлэн үзэх</h2>
          <div className="row-scroll">
            {continueList.map((series) => {
              const at = s.progress[series.id];
              return (
                <Link
                  key={series.id}
                  to={`/watch/${series.id}/${at}`}
                  className="row-card"
                >
                  <img src={series.poster} alt={series.title} loading="lazy" />
                  <div className="row-card-bar">
                    <div
                      className="row-card-fill"
                      style={{ width: `${(at / series.episodes.length) * 100}%` }}
                    />
                  </div>
                  <span className="row-card-title">{series.title}</span>
                  <span className="row-card-sub">
                    {at}/{series.episodes.length} анги
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {categories.length > 1 && (
        <nav className="cat-bar">
          <button
            className={`cat-chip ${cat === null ? "cat-chip-on" : ""}`}
            onClick={() => setCat(null)}
          >
            Бүгд
          </button>
          {categories.map((c) => (
            <button
              key={c}
              className={`cat-chip ${cat === c ? "cat-chip-on" : ""}`}
              onClick={() => setCat(c)}
            >
              {c}
            </button>
          ))}
        </nav>
      )}

      <section className="grid">
        {shown.map((series) => {
          const last = s.progress[series.id];
          const owned = buyStatus(s, series.id) === "owned";
          return (
            <Link key={series.id} to={`/series/${series.id}`} className="card">
              <div className="card-poster">
                <img src={series.poster} alt={series.title} loading="lazy" />
                <span className="card-eps">{series.episodes.length} анги</span>
                {last && <span className="card-progress">{last}-р анги хүртэл үзсэн</span>}
              </div>
              <div className="card-body">
                <h3>{series.title}</h3>
                <p className="card-genre">
                  {series.genre} ·{" "}
                  {series.price <= 0 ? "Үнэгүй" : owned ? "✅ Нээлттэй" : formatPrice(series.price)}
                </p>
                <p className="card-tagline">{series.tagline}</p>
              </div>
            </Link>
          );
        })}
      </section>

      <section className="trust-strip">
        <div className="trust-item">
          <span className="trust-icon">🎬</span>
          <span>Эхний ~20 минут үнэгүй</span>
        </div>
        <div className="trust-item">
          <span className="trust-icon">♾️</span>
          <span>Нэг удаа төлөөд хязгааргүй үзнэ</span>
        </div>
        <div className="trust-item">
          <span className="trust-icon">⚡</span>
          <span>Төлбөр ормогц автоматаар нээгдэнэ</span>
        </div>
        <Link className="btn btn-outline" to="/help">
          Хэрхэн ажилладаг вэ? →
        </Link>
      </section>

      <footer className="foot">
        {s.signedIn ? (
          <>
            {s.phone} гэж нэвтэрсэн ·{" "}
            <button className="link-btn" onClick={() => void signOut()}>
              Гарах
            </button>
            {" · "}
          </>
        ) : (
          "Кино Мандал · "
        )}
        <Link className="link-btn" to="/help">
          Тусламж
        </Link>
      </footer>
    </div>
  );
}
