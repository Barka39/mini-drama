import { Link } from "react-router-dom";
import { useAppState } from "../lib/store";
import { openAuth } from "../lib/ui";

export function AccountBadge() {
  const s = useAppState();

  if (!s.signedIn) {
    return (
      <button className="coin-badge" onClick={openAuth}>
        Нэвтрэх
      </button>
    );
  }

  return (
    <span className="badge-group">
      {s.isAdmin && (
        <Link className="coin-badge admin-link" to="/admin">
          🛠 Админ
        </Link>
      )}
      <span className="coin-badge">👤 {s.phone}</span>
    </span>
  );
}
