import { Link } from "react-router-dom";
import { CATALOG } from "../data/catalog";
import { useAppState } from "../lib/store";
import { CoinBadge } from "../components/CoinBadge";

export function Home() {
  const s = useAppState();

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">▶</span> Мини Драм
        </div>
        <CoinBadge />
      </header>

      <section className="hero">
        <h1>Богино ангитай драм, монголоор</h1>
        <p>1–2 минутын ангиуд · Эхний ангиуд үнэгүй · Утсандаа шууд үз</p>
      </section>

      <section className="grid">
        {CATALOG.map((series) => {
          const last = s.progress[series.id];
          return (
            <Link key={series.id} to={`/series/${series.id}`} className="card">
              <div className="card-poster">
                <img src={series.poster} alt={series.title} loading="lazy" />
                <span className="card-eps">{series.episodes.length} анги</span>
                {last && <span className="card-progress">{last}-р анги хүртэл үзсэн</span>}
              </div>
              <div className="card-body">
                <h3>{series.title}</h3>
                <p className="card-genre">{series.genre}</p>
                <p className="card-tagline">{series.tagline}</p>
              </div>
            </Link>
          );
        })}
      </section>

      <footer className="foot">
        Демо хувилбар · Контент: tale2film туршилтын бичлэгүүд
      </footer>
    </div>
  );
}
