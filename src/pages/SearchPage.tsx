import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { formatPrice, seriesCategories } from "../data/catalog";
import { buyStatus, useAppState } from "../lib/store";
import { useCatalog } from "../lib/seriesAdmin";
import { AccountBadge } from "../components/AccountBadge";

export function SearchPage() {
  const s = useAppState();
  const catalog = useCatalog();
  const [q, setQ] = useState("");

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return catalog;
    return catalog.filter((x) =>
      [x.title, x.tagline, x.genre].some((f) => (f ?? "").toLowerCase().includes(term)),
    );
  }, [q, catalog]);

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">Хайх</div>
        <AccountBadge />
      </header>

      <div className="search-wrap">
        <input
          className="search-input"
          placeholder="Киноны нэр, ангилал…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
      </div>

      {q.trim() && (
        <p className="muted small search-count">{results.length} үр дүн</p>
      )}

      <section className="grid">
        {results.map((series) => {
          const owned = buyStatus(s, series.id) === "owned";
          return (
            <Link key={series.id} to={`/series/${series.id}`} className="card">
              <div className="card-poster">
                <img src={series.poster} alt={series.title} loading="lazy" />
                <span className="card-eps">{series.episodes.length} анги</span>
              </div>
              <div className="card-body">
                <h3>{series.title}</h3>
                <p className="card-genre">
                  {seriesCategories(series).join(" · ")} ·{" "}
                  {series.price <= 0 ? "Үнэгүй" : owned ? "✅ Нээлттэй" : formatPrice(series.price)}
                </p>
              </div>
            </Link>
          );
        })}
      </section>

      {results.length === 0 && (
        <p className="muted center-text">
          «{q}» гэсэн кино олдсонгүй.
          <br />
          Өөр үг оруулж үзнэ үү.
        </p>
      )}
    </div>
  );
}
