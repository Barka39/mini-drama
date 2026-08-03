import { useEffect, useState } from "react";
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
}

/** Бичлэгийн хаягийг сервертэй эрхээ шалгуулж авдаг тоглуулагч */
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
}: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

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
    <video
      ref={registerRef}
      src={src}
      poster={poster}
      playsInline
      muted={muted}
      preload={preloadAuto ? "auto" : "metadata"}
      controlsList="nodownload"
      disablePictureInPicture
      onContextMenu={(e) => e.preventDefault()}
      onClick={(e) => {
        const v = e.currentTarget;
        if (v.paused) v.play();
        else v.pause();
      }}
      onTimeUpdate={(e) => {
        if (!isActive) return;
        const v = e.currentTarget;
        if (v.duration > 0) onProgress((v.currentTime / v.duration) * 100);
      }}
      onEnded={onEnded}
    />
  );
}
