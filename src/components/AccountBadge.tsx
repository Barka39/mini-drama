import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
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

  if (!s.signedIn) {
    return (
      <button className="coin-badge" onClick={openAuth}>
        Нэвтрэх
      </button>
    );
  }

  return (
    <span className="badge-group" ref={boxRef}>
      {s.isAdmin && (
        <Link className="coin-badge admin-link" to="/admin">
          🛠 Админ
        </Link>
      )}
      <span className="account-wrap">
        <button className="coin-badge" onClick={() => setOpen(!open)}>
          👤 {s.phone} ▾
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
              🚪 Гарах
            </button>
          </div>
        )}
      </span>
    </span>
  );
}
