import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { Check, ChevronLeft, Clock, Crown, Lock, Play, Plus, Share2, ShieldCheck, Zap } from "lucide-react";
import {
  formatDuration,
  formatPrice,
  freeEpCount,
  isAdult,
  seriesCategories,
  totalSeconds,
} from "../data/catalog";
import { buyStatus, canWatch, hasVip, toggleMyList, useAppState } from "../lib/store";
import { useCatalog, useSeriesById } from "../lib/seriesAdmin";
import { cheapestPlan, usePlans } from "../lib/plans";
import { SITE } from "../lib/accessLinks";
import { PATH_MODE } from "../lib/routing";
import { track } from "../lib/track";
import { openPurchase, openVip } from "../lib/ui";
import { AccountBadge } from "../components/AccountBadge";

const DEFAULT_TITLE = "Кино Мандал — Монгол хадмалтай кинонууд";

/** Доош гүйлгэхэд дээд мөр бараан шил болно (бичиг товчнуудын ард харагдахгүй) */
function useScrolled(px = 24): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const f = () => setOn(window.scrollY > px);
    f();
    window.addEventListener("scroll", f, { passive: true });
    return () => window.removeEventListener("scroll", f);
  }, [px]);
  return on;
}

export function SeriesPage() {
  const { seriesId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const scrolled = useScrolled();
  const s = useAppState();
  const series = useSeriesById(seriesId);
  const catalog = useCatalog();
  const plan = cheapestPlan(usePlans());

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
        <Link className="btn btn-glass" to="/">
          Нүүр хуудас
        </Link>
      </div>
    );
  }

  const freeCount = freeEpCount(series);
  const status = buyStatus(s, series.id);
  const vip = hasVip(s);
  const open = series.price <= 0 || vip || status === "owned";
  const continueEp = s.progress[series.id] ?? 1;
  const movie = !!series.hls;
  const total = totalSeconds(series);
  const savedAt = s.movieTime[series.id]?.t ?? 0;
  // Төгсгөлд нь хүрсэн бол «үргэлжлүүлэх» биш «дахин үзэх»
  const resumable = movie && savedAt > 30 && savedAt < total - 60;
  const mm = Math.floor(savedAt / 60);
  const inList = s.myList.includes(series.id);
  const cats = seriesCategories(series);
  // Төстэй кинонууд: ижил ангилалтайг эхэнд, дутвал бусдаар нөхнө
  const others = catalog.filter((x) => x.id !== series.id);
  const similar = [
    ...others.filter((x) => seriesCategories(x).some((c) => cats.includes(c))),
    ...others.filter((x) => !seriesCategories(x).some((c) => cats.includes(c))),
  ].slice(0, 10);

  function share() {
    if (!series) return;
    // #-гүй хаяг: Facebook/Messenger дээр киноны нэр, зурагтай карт гарна
    const url = `${PATH_MODE ? SITE : "https://kinomandal.com"}/series/${series.id}?src=share`;
    const text = `«${series.title}» — Кино Мандал дээр үзээрэй`;
    if (navigator.share) void navigator.share({ title: series.title, text, url }).catch(() => undefined);
    else void navigator.clipboard?.writeText(url).then(() => alert("Линк хуулагдлаа"));
    track("share", series.id);
  }

  return (
    <div className="sd">
      <div className="sd-backdrop" style={{ backgroundImage: `url(${series.poster})` }} />

      <header className={`sd-top ${scrolled ? "sd-top-on" : ""}`}>
        {/* Зөвхөн сайт дотроос ирсэн бол буцна — гаднаас (QPay, Facebook) ирсэн бол нүүр рүү */}
        <button
          className="icon-btn icon-btn-glass"
          onClick={() => (location.key !== "default" ? navigate(-1) : navigate("/"))}
          aria-label="Буцах"
        >
          <ChevronLeft size={22} />
        </button>
        <div className="sd-top-right">
          <button className="icon-btn icon-btn-glass" onClick={share} aria-label="Хуваалцах">
            <Share2 size={19} />
          </button>
          <AccountBadge />
        </div>
      </header>

      <section className="sd-hero">
        <div className="sd-art">
          <img src={series.poster} alt={series.title} />
          {isAdult(series) && <span className="km-18 km-18-lg">18+</span>}
        </div>

        <div className="sd-info">
          <h1 className="sd-title">{series.title}</h1>
          <p className="sd-meta">
            {cats
              .filter((c) => c !== "18+")
              .map((c) => (
                <span key={c}>{c}</span>
              ))}
            <span>
              <Clock size={13} /> {formatDuration(total)}
            </span>
            {isAdult(series) && (
              <span>
                <b className="sd-meta-18">18+</b>
              </span>
            )}
          </p>
          {series.tagline && <p className="sd-tagline">{series.tagline}</p>}

          {!open && (
            <p className="sd-note">
              Эхний <strong>{series.freeMinutes} минут үнэгүй</strong> · Бүтэн кино{" "}
              <strong>{formatPrice(series.price)}</strong>
            </p>
          )}
          {open && series.price > 0 && (
            <p className="sd-note sd-note-open">
              <Check size={15} strokeWidth={3} /> {vip && status !== "owned" ? "Сарын эрхээр нээлттэй" : "Танд нээлттэй"}
            </p>
          )}

          <div className="sd-cta">
            <button
              className="btn btn-play btn-wide"
              onClick={() =>
                navigate(movie ? `/movie/${series.id}` : `/watch/${series.id}/${continueEp}`)
              }
            >
              <Play size={18} fill="currentColor" />
              {movie
                ? resumable
                  ? `Үргэлжлүүлэх · ${mm} дахь минутаас`
                  : open
                    ? "Үзэх"
                    : "Үнэгүй хэсгийг үзэх"
                : continueEp > 1
                  ? `${continueEp}-р ангиас үргэлжлүүлэх`
                  : "Үзэж эхлэх"}
            </button>
            {resumable && (
              <div className="resume-bar">
                <div className="resume-fill" style={{ width: `${(savedAt / total) * 100}%` }} />
              </div>
            )}

            {series.price > 0 && !open && status === "none" && (
              <button
                className="btn btn-primary btn-wide"
                onClick={() => {
                  track("buy_click", series.id);
                  openPurchase(series.id);
                }}
              >
                Бүтэн киног авах — {formatPrice(series.price)}
              </button>
            )}
            {series.price > 0 && !open && status === "pending" && (
              <button
                className="btn btn-glass btn-wide"
                onClick={() => {
                  track("buy_click", series.id);
                  openPurchase(series.id);
                }}
              >
                <Clock size={17} /> Төлбөр хүлээгдэж байна
              </button>
            )}
          </div>

          <div className="sd-actions">
            <button className="sd-action" onClick={() => toggleMyList(series.id)}>
              {inList ? <Check size={20} /> : <Plus size={20} />}
              <span>{inList ? "Жагсаалтад" : "Жагсаалт"}</span>
            </button>
            <button className="sd-action" onClick={share}>
              <Share2 size={20} />
              <span>Хуваалцах</span>
            </button>
            {!vip && (
              <button className="sd-action sd-action-gold" onClick={openVip}>
                <Crown size={20} />
                <span>Сарын эрх</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {!open && (
        <section className="sd-offer">
          <div className="sd-offer-item">
            <Zap size={18} />
            <span>QPay-ээр төлмөгц кино шууд нээгдэнэ — бүртгэл шаардлагагүй</span>
          </div>
          <div className="sd-offer-item">
            <ShieldCheck size={18} />
            <span>Нэг удаа төлөөд хязгааргүй үзнэ</span>
          </div>
          {plan && (
            <button className="sd-offer-vip" onClick={openVip}>
              <Crown size={18} />
              <span>
                Эсвэл <strong>бүх {catalog.length} кино</strong> сард {formatPrice(plan.price)}
              </span>
            </button>
          )}
        </section>
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
                {!watchable && (
                  <span className="ep-lock-overlay">
                    <Lock size={20} />
                  </span>
                )}
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
        <section className="hm-row sd-similar">
          <h2 className="hm-row-title">Танд таалагдаж магадгүй</h2>
          <div className="hm-row-scroll">
            {similar.map((x) => (
              <Link key={x.id} to={`/series/${x.id}`} className="hm-card">
                <span className="hm-card-img">
                  <img src={x.poster} alt={x.title} loading="lazy" />
                  {isAdult(x) && <span className="km-18">18+</span>}
                </span>
                <span className="hm-card-title">{x.title}</span>
                <span className="hm-meta">{formatDuration(totalSeconds(x))}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
