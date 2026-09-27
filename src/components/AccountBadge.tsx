import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, LogIn, LogOut, Settings, UserRound } from "lucide-react";
import { signOut, useAppState } from "../lib/store";
import { openAuth } from "../lib/ui";

export function AccountBadge() {
  const s = useAppState();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLSpanElement>(null);

  // Хажуу тийш дарахад цэс хаагдана
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [open]);

  // Зочинд (бүртгэлгүй QPay-ээр кино авсан) «Гарах» өгөхгүй — гарвал авсан кино нь
  // энэ утаснаас алга болно. Оронд нь нэвтрэх/бүртгүүлэх (кинонууд нь шилжинэ).
  if (!s.signedIn || s.guest) {
    return (
      <button className="coin-badge acct-login" onClick={openAuth}>
        <LogIn size={15} strokeWidth={2.2} />
        Нэвтрэх
      </button>
    );
  }

  return (
    <span className="badge-group" ref={boxRef}>
      {s.isAdmin && (
        <Link className="coin-badge admin-link" to="/admin">
          <Settings size={14} /> <span className="acct-admin-text">Админ</span>
        </Link>
      )}
      <span className="account-wrap">
        <button className="coin-badge" onClick={() => setOpen(!open)}>
          <UserRound size={15} strokeWidth={2.2} />
          {s.phone}
          <ChevronDown size={14} />
        </button>
        {open && (
          <div className="account-menu">
            <button
              className="account-menu-item"
              onClick={() => {
                setOpen(false);
                void signOut();
              }}
            >
              <LogOut size={15} /> Гарах
            </button>
          </div>
        )}
      </span>
    </span>
  );
}
