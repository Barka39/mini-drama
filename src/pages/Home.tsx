import { useMemo, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  allCategories,
  formatDuration,
  formatPrice,
  seriesCategories,
  totalSeconds,
  watchPath,
  type Series,
} from "../data/catalog";
import {
  buyStatus,
  hasVip,
  signOut,
  toggleMyList,
  useAppState,
  type AppState,
} from "../lib/store";
import { openVip } from "../lib/ui";
import { useCatalog } from "../lib/seriesAdmin";
import { cheapestPlan, usePlans, vipPhase } from "../lib/plans";
import { AccountBadge } from "../components/AccountBadge";

/** Киноны id нь огноотой (series-YYMMDD-HHMM) — сүүлийн 14 хоногт нэмэгдсэн бол «ШИНЭ» */
function isNew(id: string): boolean {
  const m = /^series-(\d{2})(\d{2})(\d{2})-/.exec(id);
  if (!m) return false;
  const added = new Date(2000 + Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  return Date.now() - added < 14 * 86400000;
}

/** Хаана хүрсэн бэ: 0..1 (эхлээгүй/дууссан бол null) */
function progressOf(s: AppState, series: Series): { pct: number; label: string } | null {
  if (series.hls) {
    const mt = s.movieTime[series.id];
    if (!mt || mt.t < 30 || mt.t > mt.d - 60) return null;
    return { pct: mt.t / mt.d, label: `${formatDuration(mt.d - mt.t)} үлдсэн` };
  }
  const at = s.progress[series.id];
  if (!at || at <= 1 || at >= series.episodes.length) return null;
  return { pct: at / series.episodes.length, label: `${at}/${series.episodes.length} анги` };
}

function priceLabel(s: AppState, series: Series): string {
  if (series.price <= 0) return "Үнэгүй";
  if (hasVip(s) || buyStatus(s, series.id) === "owned") return "✅ Нээлттэй";
  return formatPrice(series.price);
}

/** Хэвтээ гүйдэг эгнээ — Netflix маягийн үндсэн нэгж */
function Row({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="row-block">
      <h2 className="row-title">{title}</h2>
      <div className="row-scroll">{children}</div>
    </section>
  );
}

function PosterCard({ series, s, to }: { series: Series; s: AppState; to?: string }) {
  const prog = progressOf(s, series);
  return (
    <Link to={to ?? `/series/${series.id}`} className="row-card">
      <span className="row-card-img">
        <img src={series.poster} alt={series.title} loading="lazy" />
        {isNew(series.id) && <span className="badge badge-new">ШИНЭ</span>}
        {series.price <= 0 && <span className="badge badge-free">ҮНЭГҮЙ</span>}
      </span>
      {prog && (
        <div className="row-card-bar">
          <div className="row-card-fill" style={{ width: `${prog.pct * 100}%` }} />
        </div>
      )}
      <span className="row-card-title">{series.title}</span>
      <span className="row-card-sub">{prog ? prog.label : priceLabel(s, series)}</span>
    </Link>
  );
}

export function Home() {
  const s = useAppState();
  const catalog = useCatalog();
  const navigate = useNavigate();
  const plan = cheapestPlan(usePlans());

  const featured = catalog[0];
  const categories = useMemo(() => allCategories(catalog), [catalog]);

  // Эхэлсэн мөртлөө дуусгаагүй кинонууд — буцаж ирэх гол шалтгаан
  const continueList = useMemo(
    () => catalog.filter((x) => progressOf(s, x) !== null).slice(0, 10),
    [catalog, s],
  );
  const myList = useMemo(
    () => s.myList.map((id) => catalog.find((c) => c.id === id)).filter(Boolean) as Series[],
    [catalog, s.myList],
  );
  const owned = useMemo(
    () => catalog.filter((x) => x.price > 0 && s.purchased.includes(x.id)),
    [catalog, s.purchased],
  );

  if (!featured) {
    return <div className="page center">Ачаалж байна…</div>;
  }

  const phase = vipPhase(s);
  const featuredProg = progressOf(s, featured);
  const inList = s.myList.includes(featured.id);
  const vip = hasVip(s);

  return (
    <div className="page home">
      <header className="topbar topbar-over">
        <div className="brand">
          <span className="brand-mark">▶</span> Кино Мандал
        </div>
        <AccountBadge />
      </header>

      {/* Онцлох кино — нүүрний хамгийн том зай хамгийн шинэ кинонд */}
      <section className="billboard" style={{ backgroundImage: `url(${featured.poster})` }}>
        <div className="billboard-shade" />
        <div className="billboard-body">
          {isNew(featured.id) && <span className="badge badge-new">ШИНЭ</span>}
          <h1>{featured.title}</h1>
          <p className="billboard-meta">
            {featured.genre} · {formatDuration(totalSeconds(featured))} ·{" "}
            {priceLabel(s, featured)}
          </p>
          {featured.tagline && <p className="billboard-tagline">{featured.tagline}</p>}
          <div className="billboard-actions">
            <button
              className="btn btn-primary"
              onClick={() =>
                navigate(watchPath(featured, s.progress[featured.id] ?? 1))
              }
            >
              ▶ {featuredProg ? "Үргэлжлүүлэх" : "Үзэх"}
            </button>
            <button className="btn btn-glass" onClick={() => toggleMyList(featured.id)}>
              {inList ? "✓ Жагсаалтад" : "+ Жагсаалт"}
            </button>
            <Link className="btn btn-glass" to={`/series/${featured.id}`}>
              ℹ
            </Link>
          </div>
          {featured.price > 0 && !vip && buyStatus(s, featured.id) !== "owned" && (
            <p className="billboard-free">Эхний {featured.freeMinutes} минут үнэгүй</p>
          )}
        </div>
      </section>

      {continueList.length > 0 && (
        <Row title="Үргэлжлүүлэн үзэх">
          {continueList.map((x) => (
            <PosterCard
              key={x.id}
              series={x}
              s={s}
              to={watchPath(x, s.progress[x.id] ?? 1)}
            />
          ))}
        </Row>
      )}

      {/* Сарын эрх: үе шат бүрд өөр мессеж — орлогын ихэнх нь эндээс ордог */}
      {phase.kind === "ending" && (
        <button className="vip-banner vip-banner-warn" onClick={openVip}>
          <span className="vip-banner-text">
            <strong>⏳ Сарын эрх {phase.daysLeft} хоногийн дараа дуусна</strong>
            <span className="muted small">
              Одоо сунгавал үлдсэн хоног дээр чинь нэмэгдэнэ — юу ч алдахгүй
            </span>
          </span>
          <span className="vip-banner-cta">Сунгах →</span>
        </button>
      )}
      {phase.kind === "lapsed" && (
        <button className="vip-banner vip-banner-warn" onClick={openVip}>
          <span className="vip-banner-text">
            <strong>Сарын эрх тань дууссан</strong>
            <span className="muted small">
              Сэргээвэл бүх {catalog.length} кино дахин нээгдэнэ — үзэж байсан газраасаа
            </span>
          </span>
          <span className="vip-banner-cta">Сэргээх →</span>
        </button>
      )}
      {phase.kind === "none" && (
        <button className="vip-banner" onClick={openVip}>
          <span className="vip-banner-text">
            <strong>⭐ Бүх {catalog.length} кино — нэг сарын эрхээр</strong>
            <span className="muted small">
              {plan ? `${formatPrice(plan.price)}-өөр хязгааргүй` : "Хязгааргүй"} · шинэ кино
              нэмэгдэх бүрд нээлттэй
            </span>
          </span>
          <span className="vip-banner-cta">Авах →</span>
        </button>
      )}
      {phase.kind === "active" && (
        <button className="vip-banner vip-banner-on" onClick={openVip}>
          <span className="vip-banner-text">
            <strong>⭐ Сарын эрх идэвхтэй</strong>
            <span className="muted small">
              {new Date(s.vipUntil as string).toLocaleDateString("mn-MN")} хүртэл — бүх кино
              нээлттэй
            </span>
          </span>
          <span className="vip-banner-cta">Сунгах</span>
        </button>
      )}

      {myList.length > 0 && (
        <Row title="Миний жагсаалт">
          {myList.map((x) => (
            <PosterCard key={x.id} series={x} s={s} />
          ))}
        </Row>
      )}

      <Row title="Шинээр нэмэгдсэн">
        {catalog.slice(0, 10).map((x) => (
          <PosterCard key={x.id} series={x} s={s} />
        ))}
      </Row>

      {owned.length > 0 && !vip && (
        <Row title="Миний авсан кинонууд">
          {owned.map((x) => (
            <PosterCard key={x.id} series={x} s={s} />
          ))}
        </Row>
      )}

      {/* Ангилал бүр нэг эгнээ (ганц кинотой ангиллыг эгнээ болгохгүй) */}
      {categories
        .map((c) => ({ c, items: catalog.filter((x) => seriesCategories(x).includes(c)) }))
        .filter((g) => g.items.length >= 2 && g.items.length < catalog.length)
        .map((g) => (
          <Row key={g.c} title={g.c}>
            {g.items.map((x) => (
              <PosterCard key={x.id} series={x} s={s} />
            ))}
          </Row>
        ))}

      <section className="row-block">
        <h2 className="row-title">Бүх кино</h2>
      </section>
      <section className="grid">
        {catalog.map((series) => (
          <Link key={series.id} to={`/series/${series.id}`} className="card">
            <div className="card-poster">
              <img src={series.poster} alt={series.title} loading="lazy" />
              <span className="card-eps">{formatDuration(totalSeconds(series))}</span>
              {isNew(series.id) && <span className="badge badge-new">ШИНЭ</span>}
            </div>
            <div className="card-body">
              <h3>{series.title}</h3>
              <p className="card-genre">
                {series.genre} · {priceLabel(s, series)}
              </p>
              <p className="card-tagline">{series.tagline}</p>
            </div>
          </Link>
        ))}
      </section>

      <section className="trust-strip">
        <div className="trust-item">
          <span className="trust-icon">🎬</span>
          <span>Кино бүрийн эхний хэсэг үнэгүй</span>
        </div>
        <div className="trust-item">
          <span className="trust-icon">♾️</span>
          <span>Нэг удаа төлөөд хязгааргүй үзнэ</span>
        </div>
        <div className="trust-item">
          <span className="trust-icon">⚡</span>
          <span>Төлбөр баталгаажмагц шууд нээгдэнэ</span>
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
