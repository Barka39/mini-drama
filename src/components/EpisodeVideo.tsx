import { useEffect, useRef, useState } from "react";
import { getPlayUrl } from "../lib/playback";

interface Props {
  seriesId: string;
  epIndex: number;
  videoPath: string;
  poster: string;
  muted: boolean;
  preloadAuto: boolean;
  isActive: boolean;
  registerRef: (el: HTMLVideoElement | null) => void;
  onProgress: (pct: number) => void;
  onEnded: () => void;
  onUnmute: () => void;
}

const SPEEDS = [1, 1.25, 1.5, 2];

function fmt(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}:${String(m % 60).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Бичлэгийн хаягийг сервертэй эрхээ шалгуулж авдаг, бүрэн хяналттай тоглуулагч */
export function EpisodeVideo({
  seriesId,
  epIndex,
  videoPath,
  poster,
  muted,
  preloadAuto,
  isActive,
  registerRef,
  onProgress,
  onEnded,
  onUnmute,
}: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [showCtl, setShowCtl] = useState(false);
  const [boost, setBoost] = useState(false); // удаан дарахад 2х

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const hideTimer = useRef<number | null>(null);
  const pressTimer = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    void getPlayUrl(seriesId, epIndex, videoPath).then((url) => {
      if (!alive) return;
      if (url) setSrc(url);
      else setDenied(true);
    });
    return () => {
      alive = false;
    };
  }, [seriesId, epIndex, videoPath]);

  // Хяналтууд гарч ирээд 3 секундын дараа өөрөө нуугдана
  function flashControls() {
    setShowCtl(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setShowCtl(false), 3000);
  }

  useEffect(() => {
    return () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      if (pressTimer.current) window.clearTimeout(pressTimer.current);
    };
  }, []);

  function seekBy(delta: number) {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + delta));
    flashControls();
  }

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
    flashControls();
  }

  function cycleSpeed() {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(next);
    if (videoRef.current) videoRef.current.playbackRate = next;
    flashControls();
  }

  async function toggleFullscreen() {
    const wrap = wrapRef.current;
    const v = videoRef.current as HTMLVideoElement & {
      webkitEnterFullscreen?: () => void;
    };
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        try {
          (screen.orientation as ScreenOrientation & { unlock?: () => void })?.unlock?.();
        } catch {
          /* дэмжигдээгүй бол алгасна */
        }
        return;
      }
      if (wrap?.requestFullscreen) {
        await wrap.requestFullscreen();
        // Хэвтээ бичлэг бол дэлгэцийг хэвтээ болгож үзүүлнэ
        const landscape = (v?.videoWidth ?? 0) > (v?.videoHeight ?? 0);
        if (landscape) {
          try {
            await (
              screen.orientation as ScreenOrientation & {
                lock?: (o: string) => Promise<void>;
              }
            )?.lock?.("landscape");
          } catch {
            /* iOS дэмждэггүй — гараар эргүүлнэ */
          }
        }
      } else if (v?.webkitEnterFullscreen) {
        // iPhone Safari: зөвхөн видео өөрөө бүтэн дэлгэц болно
        v.webkitEnterFullscreen();
      }
    } catch {
      /* хэрэглэгч татгалзсан бол юу ч хийхгүй */
    }
    flashControls();
  }

  // Баруун талыг удаан дарахад 2х хурдаар (тавихад буцаана)
  function onPressStart(e: React.PointerEvent) {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    if (e.clientX < rect.left + rect.width / 2) return; // зөвхөн баруун тал
    pressTimer.current = window.setTimeout(() => {
      setBoost(true);
      if (videoRef.current) videoRef.current.playbackRate = 2;
    }, 400);
  }

  function onPressEnd() {
    if (pressTimer.current) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
    if (boost) {
      setBoost(false);
      if (videoRef.current) videoRef.current.playbackRate = speed;
    }
  }

  if (denied) {
    return (
      <div className="lock-slide" style={{ backgroundImage: `url(${poster})` }}>
        <div className="lock-panel">
          <p className="muted">Энэ ангийг үзэх эрх олдсонгүй. Хуудсаа шинэчлээд үзнэ үү.</p>
        </div>
      </div>
    );
  }

  if (!src) {
    return (
      <div className="video-loading" style={{ backgroundImage: `url(${poster})` }}>
        <span className="pay-spinner" />
      </div>
    );
  }

  return (
    <div
      className="vplayer"
      ref={wrapRef}
      onPointerDown={onPressStart}
      onPointerUp={onPressEnd}
      onPointerCancel={onPressEnd}
      onPointerLeave={onPressEnd}
    >
      <video
        ref={(el) => {
          videoRef.current = el;
          registerRef(el);
          if (el) el.playbackRate = speed;
        }}
        src={src}
        poster={poster}
        playsInline
        muted={muted}
        preload={preloadAuto ? "auto" : "metadata"}
        controlsList="nodownload"
        disablePictureInPicture
        onContextMenu={(e) => e.preventDefault()}
        onClick={() => (showCtl ? togglePlay() : flashControls())}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration || 0)}
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          setCur(v.currentTime);
          if (isActive && v.duration > 0) onProgress((v.currentTime / v.duration) * 100);
        }}
        onEnded={onEnded}
      />

      {boost && <div className="speed-flash">2× хурдтай ⏩</div>}

      {isActive && (
        <div className={`vctl ${showCtl ? "vctl-on" : ""}`}>
          <div className="vctl-row vctl-mid">
            <button className="vctl-btn" onClick={() => seekBy(-10)} aria-label="10 секунд ухраах">
              ⏪ 10
            </button>
            <button className="vctl-btn vctl-play" onClick={togglePlay}>
              {playing ? "⏸" : "▶"}
            </button>
            <button className="vctl-btn" onClick={() => seekBy(10)} aria-label="10 секунд урагшлах">
              10 ⏩
            </button>
          </div>

          <div className="vctl-bottom">
            <span className="vctl-time">{fmt(cur)}</span>
            <input
              className="vctl-seek"
              type="range"
              min={0}
              max={dur || 0}
              step={0.5}
              value={Math.min(cur, dur || 0)}
              onChange={(e) => {
                const v = videoRef.current;
                if (v) v.currentTime = Number(e.target.value);
                setCur(Number(e.target.value));
                flashControls();
              }}
            />
            <span className="vctl-time">{fmt(dur)}</span>
            <button className="vctl-mini" onClick={cycleSpeed}>
              {speed}×
            </button>
            {muted && (
              <button className="vctl-mini" onClick={onUnmute} aria-label="Дуу асаах">
                🔇
              </button>
            )}
            <button className="vctl-mini" onClick={toggleFullscreen} aria-label="Бүтэн дэлгэц">
              ⛶
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
