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

/** Хамгийн хямд (ихэвчлэн 1 сарын) багц — «…-өөс эхлэн» гэж харуулна */
export function cheapestPlan(plans: Plan[]): Plan | null {
  return plans.length ? plans.reduce((a, b) => (a.price <= b.price ? a : b)) : null;
}

export type VipPhase =
  | { kind: "none" }
  | { kind: "active"; daysLeft: number }
  | { kind: "ending"; daysLeft: number } // 3 хоногоос бага үлдсэн
  | { kind: "lapsed"; daysAgo: number }; // саяхан дууссан (14 хоногийн дотор)

/** Сарын эрхийн үе шат — сануулгыг зөв мөчид харуулахын тулд */
export function vipPhase(s: AppState): VipPhase {
  if (!s.vipUntil) return { kind: "none" };
  const days = (new Date(s.vipUntil).getTime() - Date.now()) / 86400000;
  if (days > 3) return { kind: "active", daysLeft: Math.ceil(days) };
  if (days > 0) return { kind: "ending", daysLeft: Math.max(1, Math.ceil(days)) };
  if (days > -14) return { kind: "lapsed", daysAgo: Math.floor(-days) };
  return { kind: "none" };
}
