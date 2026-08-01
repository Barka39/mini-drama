// Каталогийн өгөгдөл catalog.json-д хадгалагдана — tools/add-series.ps1 скрипт
// шинэ цуврал нэмэхдээ тэр файлыг өөрчилдөг тул энд зөвхөн ачаалагч логик бий.
import raw from "./catalog.json";

export interface Episode {
  index: number; // 1-based
  video: string;
  title: string;
}

export interface Series {
  id: string;
  title: string;
  tagline: string;
  genre: string;
  poster: string;
  freeCount: number; // эхний хэдэн анги үнэгүй
  unlockCost: number; // нэг анги нээх coin
  bundleCost: number; // бүх ангийг нэг дор нээх coin (хямдралтай)
  episodes: Episode[];
}

const BASE = import.meta.env.BASE_URL;

export const CATALOG: Series[] = raw.series.map((s) => ({
  ...s,
  poster: BASE + s.poster,
  episodes: s.episodes.map((e) => ({ ...e, video: BASE + e.video })),
}));

export function getSeries(id: string): Series | undefined {
  return CATALOG.find((s) => s.id === id);
}
