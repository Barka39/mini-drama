// Бичлэгийн хаягийг шууд ашиглахаа больж, сервертэй эрхээ шалгуулж авдаг болов.
//
// Учир нь: шууд R2 хаяг нээлттэй байсан тул холбоосыг мэдсэн хүн (эсвэл
// татагч програм) төлбөртэй ангийг ч чөлөөтэй татаж чаддаг байсан. Одоо
// сервер эрхийг шалгаад хэдхэн минут хүчинтэй, гарын үсэгтэй холбоос өгнө.
import { supa } from "./supa";

interface Cached {
  url: string;
  exp: number;
}

const cache = new Map<string, Cached>();
const inflight = new Map<string, Promise<string | null>>();

export type PlayError = "auth" | "not_purchased" | "error";

function fileFromVideoPath(video: string): string {
  return video.split("/").pop() ?? "";
}

async function request(seriesId: string, ep: number, file: string): Promise<string | null> {
  const { data } = await supa.auth.getSession();
  const token = data.session?.access_token;

  const res = await fetch(
    `/api/play?series=${encodeURIComponent(seriesId)}&ep=${ep}&file=${encodeURIComponent(file)}`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  );
  if (!res.ok) return null;
  const body = (await res.json()) as { url?: string; exp?: number };
  if (!body.url || !body.exp) return null;
  cache.set(file, { url: body.url, exp: body.exp });
  return body.url;
}

/** Тухайн ангийг тоглуулах хаяг авна. Эрхгүй бол null. */
export function getPlayUrl(seriesId: string, ep: number, video: string): Promise<string | null> {
  const file = fileFromVideoPath(video);
  const hit = cache.get(file);
  // Хугацаа дуусахаас 2 минутын өмнө шинэчилнэ
  if (hit && hit.exp - 120 > Math.floor(Date.now() / 1000)) {
    return Promise.resolve(hit.url);
  }
  const running = inflight.get(file);
  if (running) return running;

  const p = request(seriesId, ep, file).finally(() => inflight.delete(file));
  inflight.set(file, p);
  return p;
}

/** Хэрэглэгч гарах/нэвтрэхэд хуучин эрхийг цэвэрлэнэ */
export function clearPlayCache() {
  cache.clear();
}
