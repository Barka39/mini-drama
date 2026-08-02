import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { formatPrice, freeEpCount, getSeries } from "../data/catalog";
import { buyStatus, canWatch, setProgress, useAppState } from "../lib/store";
import { openAuth, openPurchase } from "../lib/ui";
import { AccountBadge } from "../components/AccountBadge";

export function PlayerFeed() {
  const { seriesId, epIndex } = useParams();
  const s = useAppState();
  const series = seriesId ? getSeries(seriesId) : undefined;
  const startIndex = Math.max(1, Number(epIndex) || 1);

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Map<number, HTMLVideoElement>>(new Map());
  const [active, setActive] = useState(startIndex);
  const [muted, setMuted] = useState(true);

  // Эхлэх анги руу гүйлгэх
  useEffect(() => {
    const el = containerRef.current?.querySelector(`[data-ep="${startIndex}"]`);
    el?.scrollIntoView({ behavior: "instant" as ScrollBehavior });
  }, [startIndex]);

  // Слайдууд дэлгэцийн өндөртэй тэнцүү тул scrollTop-оос идэвхтэй ангийг тооцно
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onScroll = () => {
      const ep = Math.round(container.scrollTop / container.clientHeight) + 1;
      setActive(ep);
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, [seriesId]);

  useEffect(() => {
    if (!series) return;
    setProgress(series.id, Math.min(active, series.episodes.length));
    videoRefs.current.forEach((video, ep) => {
      if (ep === active) {
        video.muted = muted;
        video.play().catch(() => {
          /* autoplay хориглогдвол хэрэглэгчийн товшилтыг хүлээнэ */
        });
      } else {
        video.pause();
        video.currentTime = 0;
      }
    });
  }, [active, muted, series, s.purchased]);

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
  const pending = buyStatus(s, series.id) === "pending";

  return (
    <div className="feed" ref={containerRef}>
      <header className="feed-topbar">
        <Link to={`/series/${series.id}`} className="back">
          ←
        </Link>
        <div className="feed-title">
          {series.title} · {active}-р анги
        </div>
        <AccountBadge />
      </header>

      {series.episodes.map((ep) => {
        const watchable = canWatch(s, series, ep.index);
        // Утасны browser цөөн video decoder зэрэг ажиллуулдаг тул зөвхөн ойр
        // орчмын ангиудыг жинхэнэ <video> болгоно — бусад нь хөнгөн зураг
        const mountVideo = Math.abs(ep.index - active) <= 2;
        return (
          <section key={ep.index} className="slide" data-ep={ep.index}>
            {watchable ? (
              mountVideo ? (
                <>
                  <video
                    ref={(el) => {
                      if (el) videoRefs.current.set(ep.index, el);
                      else videoRefs.current.delete(ep.index);
                    }}
                    src={ep.video}
                    poster={series.poster}
                    playsInline
                    loop
                    muted={muted}
                    preload={Math.abs(ep.index - active) <= 1 ? "auto" : "metadata"}
                    onClick={(e) => {
                      const v = e.currentTarget;
                      if (v.paused) v.play();
                      else v.pause();
                    }}
                  />
                  <div className="slide-meta">
                    <strong>
                      {ep.index}-р анги · {ep.title}
                    </strong>
                  </div>
                  {muted && (
                    <button className="unmute" onClick={() => setMuted(false)}>
                      🔊 Дуу асаах
                    </button>
                  )}
                </>
              ) : (
                <div
                  className="lock-slide"
                  style={{ backgroundImage: `url(${series.poster})` }}
                >
                  <div className="slide-meta">
                    <strong>
                      {ep.index}-р анги · {ep.title}
                    </strong>
                  </div>
                </div>
              )
            ) : (
              <div className="lock-slide" style={{ backgroundImage: `url(${series.poster})` }}>
                <div className="lock-panel">
                  <div className="lock-icon">🔒</div>
                  <h3>
                    {ep.index}-р анги · {ep.title}
                  </h3>
                  <p className="muted">
                    Эхний {freeCount} анги ({series.freeMinutes} минут) үнэгүй. Үргэлжлэлийг үзэхийн
                    тулд киног бүтнээр нь нээнэ — нэг удаа төлөөд дуустал үзнэ.
                  </p>
                  {!s.signedIn ? (
                    <>
                      <button className="btn btn-primary" onClick={openAuth}>
                        Нэвтрэх / Бүртгүүлэх
                      </button>
                      <p className="muted small">
                        Бүтэн кино: {formatPrice(series.price)}
                      </p>
                    </>
                  ) : pending ? (
                    <>
                      <p className="msg-ok">⏳ Хүсэлт хүлээгдэж байна</p>
                      <button className="btn btn-primary" onClick={() => openPurchase(series.id)}>
                        Шилжүүлгийн мэдээлэл харах
                      </button>
                    </>
                  ) : (
                    <button className="btn btn-primary" onClick={() => openPurchase(series.id)}>
                      🎬 Худалдаж авах — {formatPrice(series.price)}
                    </button>
                  )}
                </div>
              </div>
            )}
            {ep.index < series.episodes.length && <div className="swipe-hint">↑ Дараагийн анги</div>}
          </section>
        );
      })}

      <section className="slide end-slide" data-ep={series.episodes.length + 1}>
        <div className="lock-panel">
          <h3>Кино дууслаа 🎬</h3>
          <p className="muted">Өөр кино үзэх үү?</p>
          <Link className="btn btn-primary" to="/">
            Каталог руу буцах
          </Link>
        </div>
      </section>
    </div>
  );
}
