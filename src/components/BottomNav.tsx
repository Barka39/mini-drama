import { Link, useLocation } from "react-router-dom";
import { Clapperboard, House, MessageCircleQuestion, Search } from "lucide-react";

// Доод цэс — апп мэт мэдрэмж өгнө, гол хэсгүүд нэг товшилтын зайд байна
const TABS = [
  { to: "/", Icon: House, label: "Нүүр" },
  { to: "/search", Icon: Search, label: "Хайх" },
  { to: "/my", Icon: Clapperboard, label: "Миний" },
  { to: "/help", Icon: MessageCircleQuestion, label: "Тусламж" },
];

export function BottomNav() {
  const { pathname } = useLocation();
  // Тоглуулагч бүтэн дэлгэц тул цэс харуулахгүй
  if (pathname.startsWith("/watch") || pathname.startsWith("/movie")) return null;

  return (
    <nav className="bottom-nav">
      {TABS.map(({ to, Icon, label }) => {
        const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
        return (
          <Link key={to} to={to} className={`bn-item ${active ? "bn-on" : ""}`}>
            <Icon className="bn-icon" size={22} strokeWidth={active ? 2.3 : 1.8} />
            <span className="bn-label">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
