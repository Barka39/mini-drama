import { Link } from "react-router-dom";

/** Кино Мандалын тэмдэг: алтан цагираг (мандал) дотор тоглуулах гурвалжин */
export function BrandMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="km-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f7dc9a" />
          <stop offset="0.55" stopColor="#e3b04f" />
          <stop offset="1" stopColor="#b47e25" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="14" fill="none" stroke="url(#km-gold)" strokeWidth="2.2" />
      <circle cx="16" cy="16" r="9.5" fill="none" stroke="url(#km-gold)" strokeWidth="1" opacity="0.55" />
      <path d="M13 10.6v10.8a.8.8 0 0 0 1.2.7l8.6-5.4a.8.8 0 0 0 0-1.4l-8.6-5.4a.8.8 0 0 0-1.2.7Z" fill="url(#km-gold)" />
    </svg>
  );
}

/** Лого: тэмдэг + «КИНО МАНДАЛ». Нүүр хуудас руу холбоостой. */
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="km-brand" aria-label="Кино Мандал — нүүр хуудас">
      <BrandMark size={compact ? 24 : 28} />
      <span className="km-brand-word">
        КИНО <b>МАНДАЛ</b>
      </span>
    </Link>
  );
}
