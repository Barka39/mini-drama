import { Link, useNavigate, useParams } from "react-router-dom";
import { formatPrice, freeEpCount, getSeries } from "../data/catalog";
import { buyStatus, canWatch, useAppState } from "../lib/store";
import { openPurchase } from "../lib/ui";
import { AccountBadge } from "../components/AccountBadge";

export function SeriesPage() {
  const { seriesId } = useParams();
  const navigate = useNavigate();
  const s = useAppState();
  const series = seriesId ? getSeries(seriesId) : undefined;

  if (!series) {
    return (
      <div className="page center">
        <p>Кино олдсонгүй.</p>
        <Link className="btn" to="/">
          Нүүр хуудас
        </Link>
      </div>
    );
  }

  const freeCount = freeEpCount(series);
  const status = buyStatus(s, series.id);
  const continueEp = s.progress[series.id] ?? 1;

  return (
    <div className="page">
      <header className="topbar">
        <Link to="/" className="back">
          ←
        </Link>
        <div className="brand">{series.title}</div>
        <AccountBadge />
      </header>

      <section className="series-head">
        <img className="series-poster" src={series.poster} alt={series.title} />
        <div className="series-info">
          <h2>{series.title}</h2>
          <p className="card-genre">{series.genre}</p>
          <p className="card-tagline">{series.tagline}</p>
          {series.price > 0 && status !== "owned" && (
            <p className="muted small">
              Эхний {series.freeMinutes} минут үнэгүй · Бүтэн кино {formatPrice(series.price)}
            </p>
          )}
          <button
            className="btn btn-primary"
            onClick={() => navigate(`/watch/${series.id}/${continueEp}`)}
          >
            ▶ {continueEp > 1 ? `${continueEp}-р ангиас үргэлжлүүлэх` : "Үзэж эхлэх"}
          </button>
          {series.price > 0 && status === "none" && (
            <button className="btn btn-outline" onClick={() => openPurchase(series.id)}>
              🎬 Худалдаж авах — {formatPrice(series.price)}
            </button>
          )}
          {series.price > 0 && status === "pending" && (
            <button className="btn btn-outline" onClick={() => openPurchase(series.id)}>
              ⏳ Хүсэлт хүлээгдэж байна…
            </button>
          )}
        </div>
      </section>

      <section className="ep-grid">
        {series.episodes.map((ep) => {
          const watchable = canWatch(s, series, ep.index);
          return (
            <button
              key={ep.index}
              className={`ep-cell ${watchable ? "" : "ep-locked"}`}
              onClick={() => navigate(`/watch/${series.id}/${ep.index}`)}
            >
              <span className="ep-num">{ep.index}</span>
              <span className="ep-title">{ep.title}</span>
              {!watchable && <span className="ep-lock">🔒</span>}
              {watchable && series.price > 0 && status !== "owned" && ep.index <= freeCount && (
                <span className="ep-free">Үнэгүй</span>
              )}
            </button>
          );
        })}
      </section>
    </div>
  );
}
