// Сарын эрхийн багцууд — хэд хэдэн газар (түгжээ, нүүр, тоглуулагч) үнийг харуулдаг тул
// нэг удаа ачаалаад хуваалцана.
import { useEffect, useState } from "react";
import { loadPlans, type AppState, type Plan } from "./store";

let cached: Plan[] | null = null;
let inflight: Promise<Plan[]> | null = null;

export function usePlans(): Plan[] {
  const [plans, setPlans] = useState<Plan[]>(cached ?? []);
  useEffect(() => {
    if (cached) return;
    if (!inflight) inflight = loadPlans();
    void inflight.then((p) => {
      cached = p;
      setPlans(p);
    });
  }, []);
  return plans;
}

/** Хамгийн хямд (ихэвчлэн 1 сарын) багц — «…-өөс эхлэн» гэж харуулна. Ангилал өгвөл
 * тэр ангиллын багцаас (2026-10-21: AI / эротик тус бүр 11,900₮, бүх кино 15,900₮). */
export function cheapestPlan(plans: Plan[], scope?: Plan["scope"]): Plan | null {
  const list = scope ? plans.filter((p) => p.scope === scope) : plans;
  return list.length ? list.reduce((a, b) => (a.price <= b.price ? a : b)) : null;
}

export type VipPhase =
  | { kind: "none" }
  | { kind: "active"; daysLeft: number }
  | { kind: "ending"; daysLeft: number } // 3 хоногоос бага үлдсэн
  | { kind: "lapsed"; daysAgo: number }; // саяхан дууссан (14 хоногийн дотор)

/** Сарын эрхийн үе шат — сануулгыг зөв мөчид харуулахын тулд */
export function vipPhase(s: AppState): VipPhase {
  // хамгийн удаан үргэлжлэх эрх (бүх кино / AI / эротик) — аль нэг нь идэвхтэй бол «идэвхтэй»
  const ends = [s.vipUntil, s.vipAiUntil, s.vipEroticUntil].filter(Boolean).map((u) => new Date(u as string).getTime());
  if (!ends.length) return { kind: "none" };
  const days = (Math.max(...ends) - Date.now()) / 86400000;
  if (days > 3) return { kind: "active", daysLeft: Math.ceil(days) };
  if (days > 0) return { kind: "ending", daysLeft: Math.max(1, Math.ceil(days)) };
  if (days > -14) return { kind: "lapsed", daysAgo: Math.floor(-days) };
  return { kind: "none" };
}
