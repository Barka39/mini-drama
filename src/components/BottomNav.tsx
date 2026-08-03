import { Link, useLocation } from "react-router-dom";

// Доод цэс — апп мэт мэдрэмж өгнө, гол хэсгүүд нэг товшилтын зайд байна
const TABS = [
  { to: "/", icon: "🏠", label: "Нүүр" },
  { to: "/search", icon: "🔍", label: "Хайх" },
  { to: "/my", icon: "🎬", label: "Миний" },
  { to: "/help", icon: "💬", label: "Тусламж" },
];

export function BottomNav() {
  const { pathname } = useLocation();
  // Тоглуулагч бүтэн дэлгэц тул цэс харуулахгүй
  if (pathname.startsWith("/watch")) return null;

  return (
    <nav className="bottom-nav">
      {TABS.map((t) => {
        const active = t.to === "/" ? pathname === "/" : pathname.startsWith(t.to);
        return (
          <Link key={t.to} to={t.to} className={`bn-item ${active ? "bn-on" : ""}`}>
            <span className="bn-icon">{t.icon}</span>
            <span className="bn-label">{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
