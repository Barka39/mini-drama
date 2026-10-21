// Худалдан авах/нэвтрэх цонхыг аль ч хуудаснаас нээх боломжтой жижиг UI store
import { useSyncExternalStore } from "react";

type ModalName = "purchase" | "auth" | "vip" | null;

let openModal: ModalName = null;
let purchaseSeriesId: string | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

export function useOpenModal(): ModalName {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => openModal,
  );
}

export function usePurchaseSeriesId(): string | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => purchaseSeriesId,
  );
}

// direct: «Нэг кино» товчноос — цонх нээгдмэгц QPay (QR) руу шууд явна (2026-10-22 эзэн:
// «давхар давхар төлөх товч дарах шаардлага гарахаар хүн дундаас нь буцдаг»)
let directPay = false;
export function openPurchase(seriesId: string, direct = false) {
  purchaseSeriesId = seriesId;
  directPay = direct;
  openModal = "purchase";
  notify();
}
/** Нэг удаа уншина: энэ нээлт шууд төлбөр рүү явах уу */
export function takeDirectPay(): boolean {
  const d = directPay;
  directPay = false;
  return d;
}

// Сарын эрхийн цонх аль ангиллаас нээгдсэн бэ (тэр ангиллын багцууд эхэнд, «Бүх кино» дараа нь).
// onClick={openVip} хэлбэрээр event ирж болох тул зөвхөн "ai" | "erotic"-ийг авна.
let vipCategory: "ai" | "erotic" | null = null;
export function openVip(category?: unknown) {
  vipCategory = category === "ai" || category === "erotic" ? category : null;
  openModal = "vip";
  notify();
}
export function useVipCategory(): "ai" | "erotic" | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => vipCategory,
  );
}

// Нэвтрэх цонх: аль хуудаснаас (горим) эхлэх, амжилттай бол аль цонх руу буцах.
// Жишээ: зочин сарын эрх сонгоод бүртгүүлбэл шууд сарын эрхийн цонх руугаа буцна.
let authMode: "in" | "up" = "in";
let afterAuth: ModalName = null;

/** onClick={openAuth} хэлбэрээр ч дуудагддаг (тэгвэл эхний аргумент нь event) */
export function openAuth(mode?: unknown, then?: ModalName) {
  authMode = mode === "up" ? "up" : "in";
  afterAuth = then ?? null;
  openModal = "auth";
  notify();
}

export function authOptions(): { mode: "in" | "up"; then: ModalName } {
  return { mode: authMode, then: afterAuth };
}

/** Нэвтрэлт амжилттай: хүлээж байсан цонх руу буцна (эсвэл хаана) */
export function finishAuth() {
  openModal = afterAuth;
  afterAuth = null;
  notify();
}

export function closeModals() {
  openModal = null;
  notify();
}
