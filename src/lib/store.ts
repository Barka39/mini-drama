// Демо шат: бүх төлөв localStorage-д. Дараагийн шатанд Supabase/backend руу шилжинэ.
import { useSyncExternalStore } from "react";

const KEY = "drama-demo-state-v1";

export interface AppState {
  coins: number;
  unlocked: Record<string, number[]>; // seriesId -> нээсэн ангийн index-үүд
  progress: Record<string, number>; // seriesId -> хамгийн сүүлд үзсэн анги
  redeemedCodes: string[]; // ашигласан цэнэглэлтийн кодууд
}

const DEFAULT_STATE: AppState = { coins: 100, unlocked: {}, progress: {}, redeemedCodes: [] };

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch {
    /* эвдэрсэн бол шинээр эхэлнэ */
  }
  return { ...DEFAULT_STATE };
}

let state: AppState = load();
const listeners = new Set<() => void>();

function commit(next: AppState) {
  state = next;
  localStorage.setItem(KEY, JSON.stringify(state));
  listeners.forEach((l) => l());
}

export function useAppState(): AppState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}

export function isUnlocked(s: AppState, seriesId: string, epIndex: number, freeCount: number): boolean {
  if (epIndex <= freeCount) return true;
  return (s.unlocked[seriesId] ?? []).includes(epIndex);
}

export function unlockEpisode(seriesId: string, epIndex: number, cost: number): boolean {
  if (state.coins < cost) return false;
  const cur = state.unlocked[seriesId] ?? [];
  if (cur.includes(epIndex)) return true;
  commit({
    ...state,
    coins: state.coins - cost,
    unlocked: { ...state.unlocked, [seriesId]: [...cur, epIndex] },
  });
  return true;
}

export function unlockBundle(seriesId: string, epIndexes: number[], cost: number): boolean {
  if (state.coins < cost) return false;
  const cur = new Set(state.unlocked[seriesId] ?? []);
  epIndexes.forEach((i) => cur.add(i));
  commit({
    ...state,
    coins: state.coins - cost,
    unlocked: { ...state.unlocked, [seriesId]: [...cur] },
  });
  return true;
}

export function addCoins(amount: number) {
  commit({ ...state, coins: state.coins + amount });
}

export function redeemCoins(amount: number, code: string) {
  commit({
    ...state,
    coins: state.coins + amount,
    redeemedCodes: [...state.redeemedCodes, code.trim().toUpperCase()],
  });
}

export function setProgress(seriesId: string, epIndex: number) {
  if (state.progress[seriesId] === epIndex) return;
  commit({ ...state, progress: { ...state.progress, [seriesId]: epIndex } });
}
