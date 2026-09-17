import { useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  formatDuration,
  formatPrice,
  freeEpCount,
  seriesCategories,
  totalSeconds,
} from "../data/catalog";
import { buyStatus, canWatch, toggleMyList, useAppState } from "../lib/store";
import { useCatalog, useSeriesById } from "../lib/seriesAdmin";
import { SITE } from "../lib/accessLinks";
import { track } from "../lib/track";
import { openPurchase } from "../lib/ui";
import { AccountBadge } from "../components/AccountBadge";

const DEFAULT_TITLE = "Кино Мандал — богино драм монголоор";

export function SeriesPage() {
  const { seriesId } = useParams();
  const navigate = useNavigate();
  const s = useAppState();
  const series = useSeriesById(seriesId);
  const catalog = useCatalog();

  useEffect(() => {
    if (series) {
      document.title = `${series.title} — Кино Мандал`;
      track("open_series", series.id);
    }
    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, [series]);

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
  const movie = !!series.hls;
  const savedAt = s.movieTime[series.id]?.t ?? 0;
  // Төгсгөлд нь хүрсэн бол «үргэлжлүүлэх» биш «дахин үзэх»
  const resumable = movie && savedAt > 30 && savedAt < totalSeconds(series) - 60;
  const mm = Math.floor(savedAt / 60);
  const inList = s.myList.includes(series.id);
  // Төстэй кинонууд: ижил ангилалтайг эхэнд, дутвал бусдаар нөхнө
  const cats = seriesCategories(series);
  const others = catalog.filter((x) => x.id !== series.id);
  const similar = [
    ...others.filter((x) => seriesCategories(x).some((c) => cats.includes(c))),
    ...others.filter((x) => !seriesCategories(x).some((c) => cats.includes(c))),
  ].slice(0, 8);

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
          <p className="card-genre">
            {series.genre} · {formatDuration(totalSeconds(series))}
          </p>
          <p className="card-tagline">{series.tagline}</p>
          {series.price > 0 && status !== "owned" && (
            <p className="muted small">
              Эхний {series.freeMinutes} минут үнэгүй · Бүтэн кино {formatPrice(series.price)}
            </p>
          )}
          <button
            className="btn btn-primary"
            onClick={() =>
              navigate(movie ? `/movie/${series.id}` : `/watch/${series.id}/${continueEp}`)
            }
          >
            ▶{" "}
            {movie
              ? resumable
                ? `Үргэлжлүүлэх · ${mm} дахь минутаас`
                : "Үзэж эхлэх"
              : continueEp > 1
                ? `${continueEp}-р ангиас үргэлжлүүлэх`
                : "Үзэж эхлэх"}
          </button>
          {resumable && (
            <div className="resume-bar">
              <div
                className="resume-fill"
                style={{ width: `${(savedAt / totalSeconds(series)) * 100}%` }}
              />
            </div>
          )}
          {series.price > 0 && status === "none" && (
            <button className="btn btn-outline" onClick={() => { track("buy_click", series.id); openPurchase(series.id); }}>
              🎬 Худалдаж авах — {formatPrice(series.price)}
            </button>
          )}
          <button
            className="btn btn-ghost btn-list"
            onClick={() => {
              // Зарын хуудсын хаягийг хуваалцана — Facebook/Messenger дээр зурагтай карт гарна
              const url = `${SITE}/k/${series.id}?src=share`;
              const text = `«${series.title}» — Кино Мандал дээр үзээрэй`;
              if (navigator.share) void navigator.share({ title: series.title, text, url }).catch(() => undefined);
              else void navigator.clipboard?.writeText(url).then(() => alert("Линк хуулагдлаа"));
              track("share", series.id);
            }}
          >
            ↗ Найздаа хуваалцах
          </button>
          <button className="btn btn-ghost btn-list" onClick={() => toggleMyList(series.id)}>
            {inList ? "✓ Миний жагсаалтад байна" : "+ Миний жагсаалтад нэмэх"}
          </button>
          {series.price > 0 && status === "pending" && (
            <button className="btn btn-outline" onClick={() => { track("buy_click", series.id); openPurchase(series.id); }}>
              ⏳ Хүсэлт хүлээгдэж байна…
            </button>
          )}
        </div>
      </section>

      {series.price > 0 && status !== "owned" && (
        <div className="series-trust">
          <span>✅ Нэг удаа төлөөд хязгааргүй үзнэ</span>
          <span>⚡ Төлбөр баталгаажмагц шууд нээгдэнэ</span>
          <Link className="link-btn" to="/help">
            Хэрхэн ажилладаг вэ? →
          </Link>
        </div>
      )}

      {/* Нэг бүтэн кино бол ангийн сүлжээ байхгүй — шууд үзнэ */}
      <section className="ep-grid" hidden={movie}>
        {series.episodes.map((ep) => {
          const watchable = canWatch(s, series, ep.index);
          return (
            <button
              key={ep.index}
              className={`ep-cell ${watchable ? "" : "ep-locked"}`}
              onClick={() => navigate(`/watch/${series.id}/${ep.index}`)}
            >
              <span className="ep-thumb-wrap">
                <img
                  className="ep-thumb"
                  src={ep.thumb}
                  alt=""
                  loading="lazy"
                  onError={(e) => {
                    // Бяцхан зураг байхгүй бол постероор орлуулна
                    e.currentTarget.src = series.poster;
                  }}
                />
                {!watchable && <span className="ep-lock-overlay">🔒</span>}
                <span className="ep-num-badge">{ep.index}</span>
              </span>
              <span className="ep-title">{ep.title}</span>
              {watchable && series.price > 0 && status !== "owned" && ep.index <= freeCount && (
                <span className="ep-free">Үнэгүй</span>
              )}
            </button>
          );
        })}
      </section>

      {similar.length > 0 && (
        <section className="row-block similar-block">
          <h2 className="row-title">Танд таалагдаж магадгүй</h2>
          <div className="row-scroll">
            {similar.map((x) => (
              <Link key={x.id} to={`/series/${x.id}`} className="row-card">
                <img src={x.poster} alt={x.title} loading="lazy" />
                <span className="row-card-title">{x.title}</span>
                <span className="row-card-sub">{formatDuration(totalSeconds(x))}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
