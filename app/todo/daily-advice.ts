export const ADVICE_ENDPOINT = "https://korean-advice-open-api.vercel.app/api/advice";
export const ADVICE_SOURCE = "https://github.com/gwongibeom/korean-advice-open-api";
export const ADVICE_CACHE_KEY = "oddk.daily-advice.v1";

export type Advice = { author: string; authorProfile: string; message: string };
export type CachedAdvice = { version: 1; date: string; advice: Advice };
export type AdviceResult = CachedAdvice & { persisted: boolean };
type AdviceStorage = Pick<Storage, "getItem" | "setItem">;
type AdviceFetcher = (url: string, init: RequestInit) => Promise<Pick<Response, "ok" | "json">>;

export function validAdviceDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date.startsWith("0000")) return false;
  const instant = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(instant.getTime()) && instant.toISOString().slice(0, 10) === date;
}

export function parseAdvice(value: unknown): Advice | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (typeof item.author !== "string" || typeof item.message !== "string" || typeof item.authorProfile !== "string") return null;
  const author = item.author.trim(), message = item.message.trim(), authorProfile = item.authorProfile.trim();
  if (!author || author.length > 200 || !message || message.length > 2000 || authorProfile.length > 500) return null;
  return { author, authorProfile, message };
}

export function parseAdviceCache(raw: string | null): CachedAdvice | null {
  if (!raw || raw.length > 12_000) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || value.version !== 1 || typeof value.date !== "string" || !validAdviceDate(value.date)) return null;
    const advice = parseAdvice(value.advice);
    return advice ? { version: 1, date: value.date, advice } : null;
  } catch { return null; }
}

export function readAdviceCache(storage: AdviceStorage): CachedAdvice | null {
  try { return parseAdviceCache(storage.getItem(ADVICE_CACHE_KEY)); }
  catch { return null; }
}

async function requestAdvice(fetcher: AdviceFetcher, timeoutMs: number): Promise<Advice> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fetcher(ADVICE_ENDPOINT, {
        method: "GET", credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer", signal: controller.signal,
      }).then(async response => {
        if (!response.ok) throw new Error("명언 API에 연결하지 못했어요.");
        const advice = parseAdvice(await response.json());
        if (!advice) throw new Error("명언 API의 응답을 확인하지 못했어요.");
        return advice;
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error("명언 API의 응답이 늦어지고 있어요.")); }, timeoutMs);
      }),
    ]);
  } finally { clearTimeout(timer); }
}

/** Deduplicates mounts, reuses today's API result, and never writes failed responses. */
export function createAdviceLoader(storage: AdviceStorage, fetcher: AdviceFetcher, timeoutMs = 8000) {
  const pending = new Map<string, Promise<AdviceResult>>();
  let memory: AdviceResult | null = null;
  return async function load(date: string): Promise<AdviceResult> {
    if (!validAdviceDate(date)) throw new Error("한국 날짜를 확인하지 못했어요.");
    if (memory?.date === date) return memory;
    const cached = readAdviceCache(storage);
    if (cached?.date === date) return (memory = { ...cached, persisted: true });
    if (pending.has(date)) return pending.get(date)!;
    const request = (async (): Promise<AdviceResult> => {
      // The provider returns random advice. Avoid yesterday's exact same text,
      // with a bounded number of requests rather than polling indefinitely.
      for (let attempt = 0; attempt < 3; attempt++) {
        const advice = await requestAdvice(fetcher, timeoutMs);
        if (cached && cached.date < date && advice.message === cached.advice.message) continue;
        const latest = readAdviceCache(storage);
        if (latest?.date === date) return (memory = { ...latest, persisted: true });
        const entry: CachedAdvice = { version: 1, date, advice };
        let persisted = false;
        if (!latest || latest.date < date) {
          try { storage.setItem(ADVICE_CACHE_KEY, JSON.stringify(entry)); persisted = true; }
          catch { /* Keep the API result for this session when storage is unavailable. */ }
        }
        const result = { ...entry, persisted };
        if (!memory || memory.date <= date) memory = result;
        return result;
      }
      throw new Error("이전과 다른 명언을 가져오지 못했어요.");
    })();
    pending.set(date, request);
    try { return await request; }
    finally { pending.delete(date); }
  };
}

// Lazy browser storage access keeps SSR deterministic and stores no plan/user data.
export const browserAdviceStorage: AdviceStorage = {
  getItem: key => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
};
export const loadDailyAdvice = createAdviceLoader(browserAdviceStorage, (url, init) => fetch(url, init));
