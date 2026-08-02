import { Link } from "react-router-dom";
import { CATALOG, formatPrice } from "../data/catalog";
import { buyStatus, signOut, useAppState } from "../lib/store";
import { AccountBadge } from "../components/AccountBadge";

export function Home() {
  const s = useAppState();

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

      <section className="grid">
        {CATALOG.map((series) => {
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
