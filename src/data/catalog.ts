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
  // Нэг бүтэн кино (HLS). Байвал ангиудаар биш, нэг тасралтгүй бичлэгээр тоглоно.
  hls?: { duration: number };
}

const BASE = import.meta.env.BASE_URL;
// Видеонууд R2 сан дээр байрладаг (videoBase); хоосон бол сайтын хавтаснаас
const VIDEO_BASE = raw.videoBase || BASE;

// catalog.json-ы хэлбэр. Төрлийг ГАРААР заана: бүх кино нэг бүтэн бичлэг болсноор
// episodes нь хоосон массив болж, TypeScript түүнийг never[] гэж таамаглаад эвдэрдэг.
interface RawEpisode {
  index: number;
  video: string;
  title: string;
  duration: number;
}
interface RawSeries extends Omit<Series, "episodes"> {
  episodes: RawEpisode[];
}
const RAW_SERIES = raw.series as unknown as RawSeries[];

// Сүүлд нэмсэн кино эхэнд харагдана (catalog.json-д шинэ кино төгсгөлд нэмэгддэг)
export const CATALOG: Series[] = [...RAW_SERIES].reverse().map((s) => ({
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
  // Админ хуудаснаас солисон постер (R2 дээр). Хоосон бол catalog.json-ы зураг.
  poster_url?: string | null;
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
        poster: o.poster_url || s.poster,
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

/** Насанд хүрэгчдийн кино эсэх — ангилалд «18+» бичсэн бол */
export function isAdult(s: { genre: string }): boolean {
  return seriesCategories(s).includes("18+");
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

/** Кино нэг бүтэн бичлэг болсон эсэх */
export function isMovie(series: Series): boolean {
  return !!series.hls;
}

/** Киноны нийт урт (секунд): бүтэн бичлэг бол өөрийнх нь, үгүй бол ангиудын нийлбэр */
export function totalSeconds(series: Series): number {
  if (series.hls) return series.hls.duration;
  return series.episodes.reduce((a, e) => a + (e.duration || 0), 0);
}

/** «2 цаг 9 мин» / «48 мин» */
export function formatDuration(sec: number): string {
  const m = Math.max(1, Math.round(sec / 60));
  const h = Math.floor(m / 60);
  return h > 0 ? `${h} цаг ${m % 60} мин` : `${m} мин`;
}

/** Тоглуулагч руу очих зам — кино шилжсэн эсэхээс хамаарна */
export function watchPath(series: Series, epIndex = 1): string {
  return series.hls ? `/movie/${series.id}` : `/watch/${series.id}/${epIndex}`;
}

export function formatPrice(price: number): string {
  return price.toLocaleString("mn-MN") + "₮";
}
