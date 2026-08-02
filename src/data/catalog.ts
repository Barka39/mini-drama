// Каталогийн өгөгдөл catalog.json-д хадгалагдана — tools/add-series.ps1 скрипт
// шинэ цуврал нэмэхдээ тэр файлыг өөрчилдөг тул энд зөвхөн ачаалагч логик бий.
import raw from "./catalog.json";

export interface Episode {
  index: number; // 1-based
  video: string;
  title: string;
  duration: number; // секунд
}

export interface Series {
  id: string;
  title: string;
  tagline: string;
  genre: string;
  poster: string;
  price: number; // ₮ — киног бүтнээр нь нээх үнэ; 0 бол бүрэн үнэгүй
  freeMinutes: number; // эхний хэдэн минут үнэгүй
  episodes: Episode[];
}

const BASE = import.meta.env.BASE_URL;
// Видеонууд R2 сан дээр байрладаг (videoBase); хоосон бол сайтын хавтаснаас
const VIDEO_BASE = raw.videoBase || BASE;

export const CATALOG: Series[] = raw.series.map((s) => ({
  ...s,
  poster: BASE + s.poster,
  episodes: s.episodes.map((e) => ({ ...e, video: VIDEO_BASE + e.video })),
}));

export function getSeries(id: string): Series | undefined {
  return CATALOG.find((s) => s.id === id);
}

// Эхний freeMinutes минутад ЭХЭЛДЭГ ангиуд үнэгүй (үнэ 0 бол бүгд)
export function freeEpCount(series: Series): number {
  if (series.price <= 0) return series.episodes.length;
  const limitSec = series.freeMinutes * 60;
  let start = 0;
  let count = 0;
  for (const ep of series.episodes) {
    if (start >= limitSec) break;
    count++;
    start += ep.duration;
  }
  return count;
}

export function formatPrice(price: number): string {
  return price.toLocaleString("mn-MN") + "₮";
}
