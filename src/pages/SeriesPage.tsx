import { Link, useNavigate, useParams } from "react-router-dom";
import { getSeries } from "../data/catalog";
import { isUnlocked, unlockBundle, useAppState } from "../lib/store";
import { CoinBadge } from "../components/CoinBadge";

export function SeriesPage() {
  const { seriesId } = useParams();
  const navigate = useNavigate();
  const s = useAppState();
  const series = seriesId ? getSeries(seriesId) : undefined;

  if (!series) {
    return (
      <div className="page center">
        <p>Цуврал олдсонгүй.</p>
        <Link className="btn" to="/">
          Нүүр хуудас
        </Link>
      </div>
    );
  }

  const lockedIndexes = series.episodes
    .map((e) => e.index)
    .filter((i) => !isUnlocked(s, series.id, i, series.freeCount));
  const continueEp = s.progress[series.id] ?? 1;

  return (
    <div className="page">
      <header className="topbar">
        <Link to="/" className="back">
          ←
        </Link>
        <div className="brand">{series.title}</div>
        <CoinBadge />
      </header>

      <section className="series-head">
        <img className="series-poster" src={series.poster} alt={series.title} />
        <div className="series-info">
          <h2>{series.title}</h2>
          <p className="card-genre">{series.genre}</p>
          <p className="card-tagline">{series.tagline}</p>
          <button
            className="btn btn-primary"
            onClick={() => navigate(`/watch/${series.id}/${continueEp}`)}
          >
            ▶ {continueEp > 1 ? `${continueEp}-р ангиас үргэлжлүүлэх` : "Үзэж эхлэх"}
          </button>
          {lockedIndexes.length > 1 && (
            <button
              className="btn btn-outline"
              onClick={() => {
                if (!unlockBundle(series.id, lockedIndexes, series.bundleCost)) {
                  alert("Coin хүрэлцэхгүй байна. Баруун дээд буланд дарж цэнэглэнэ үү.");
                }
              }}
            >
              🔓 Багцаар нээх — {series.bundleCost} 🪙 ({lockedIndexes.length} анги)
            </button>
          )}
        </div>
      </section>

      <section className="ep-grid">
        {series.episodes.map((ep) => {
          const unlocked = isUnlocked(s, series.id, ep.index, series.freeCount);
          return (
            <button
              key={ep.index}
              className={`ep-cell ${unlocked ? "" : "ep-locked"}`}
              onClick={() => navigate(`/watch/${series.id}/${ep.index}`)}
            >
              <span className="ep-num">{ep.index}</span>
              <span className="ep-title">{ep.title}</span>
              {!unlocked && <span className="ep-lock">🔒 {series.unlockCost} 🪙</span>}
              {unlocked && ep.index <= series.freeCount && (
                <span className="ep-free">Үнэгүй</span>
              )}
            </button>
          );
        })}
      </section>
    </div>
  );
}
