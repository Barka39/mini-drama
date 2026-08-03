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

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">▶</span> Мини Драм
        </div>
        <AccountBadge />
      </header>

      <section className="hero">
        <h1>Богино ангитай драм, монголоор</h1>
        <p>Эхний минутууд үнэгүй · Нэг удаа төлөөд дуустал үзнэ · Утсандаа шууд үз</p>
      </section>

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

      <footer className="foot">
        {s.signedIn ? (
          <>
            {s.phone} гэж нэвтэрсэн ·{" "}
            <button className="link-btn" onClick={() => void signOut()}>
              Гарах
            </button>
          </>
        ) : (
          "Мини Драм · Богино драм стриминг"
        )}
      </footer>
    </div>
  );
}
