// Каталогийн өгөгдөл catalog.json-д хадгалагдана — tools/add-series.ps1 скрипт
// шинэ цуврал нэмэхдээ тэр файлыг өөрчилдөг тул энд зөвхөн ачаалагч логик бий.
import raw from "./catalog.json";

export interface Episode {
  index: number; // 1-based
  video: string;
  title: string;
  duration: number; // секунд
  thumb: string; // ангийн бяцхан зураг
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

// Сүүлд нэмсэн кино эхэнд харагдана (catalog.json-д шинэ кино төгсгөлд нэмэгддэг)
export const CATALOG: Series[] = [...raw.series].reverse().map((s) => ({
  ...s,
  poster: BASE + s.poster,
  episodes: s.episodes.map((e) => ({
    ...e,
    video: VIDEO_BASE + e.video,
    // Бяцхан зураг нэрийн дүрмээр байрлана: thumbs/<id>_e<N>.jpg
    thumb: `${BASE}thumbs/${s.id}_e${e.index}.jpg`,
  })),
}));

export function getSeries(id: string): Series | undefined {
  return CATALOG.find((s) => s.id === id);
}

// Админ хуудаснаас хийсэн засварыг (нэр, ангилал, үнэ, эрэмбэ, нуух) хэрэглэнэ.
// Сервер ачаалагдаагүй байхад catalog.json-ы утга шууд харагдана — хоосон дэлгэц гарахгүй.
export interface SeriesOverride {
  title: string;
  tagline: string;
  genre: string;
  price: number;
  free_minutes: number;
  sort_order: number;
  hidden: boolean;
}

export function applyOverrides(
  list: Series[],
  overrides: Record<string, SeriesOverride>,
): Series[] {
  if (!Object.keys(overrides).length) return list;
  const merged = list
    .map((s) => {
      const o = overrides[s.id];
      if (!o) return s;
      return {
        ...s,
        title: o.title || s.title,
        tagline: o.tagline,
        genre: o.genre || s.genre,
        price: o.price,
        freeMinutes: o.free_minutes,
      };
    })
    .filter((s) => !overrides[s.id]?.hidden);

  // sort_order их нь дээр (0 бол catalog.json-ы дараалал хэвээр)
  return merged.sort(
    (a, b) => (overrides[b.id]?.sort_order ?? 0) - (overrides[a.id]?.sort_order ?? 0),
  );
}

// Ангилал: genre талбарыг «·» эсвэл «,»-оор салгаж тус бүрийг ангилал болгоно
export function seriesCategories(s: { genre: string }): string[] {
  return s.genre
    .split(/[·,]/)
    .map((g) => g.trim())
    .filter(Boolean);
}

export function allCategories(list: Series[]): string[] {
  const seen = new Map<string, number>();
  for (const s of list) {
    for (const c of seriesCategories(s)) {
      seen.set(c, (seen.get(c) ?? 0) + 1);
    }
  }
  // Олон кинотой ангилал эхэнд
  return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
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
