import { useAppState } from "../lib/store";
import { openTopup } from "../lib/ui";

export function CoinBadge() {
  const s = useAppState();
  return (
    <button className="coin-badge" onClick={openTopup}>
      🪙 {s.coins}
    </button>
  );
}
