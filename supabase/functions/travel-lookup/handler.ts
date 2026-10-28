import { parseTravelQuery, parsePhoton, parseOsrm, validLookupPayload } from "../_shared/travel-query.ts";
import type { LookupPayload, TravelQuery } from "../_shared/travel-query.ts";
export type { LookupPayload } from "../_shared/travel-query.ts";
export type LookupCache = { payload: unknown; expiresAt: string };
export type LookupLease = { id: string; validUntil: string };
export type LookupStore = { get: (key: string) => Promise<LookupCache | null>; put: (key: string, provider: string, payload: LookupPayload, fetchedAt: string, expiresAt: string) => Promise<void>; claim: (provider: string) => Promise<LookupLease | null>; finish: (provider: string, lease: string) => Promise<void> };
export type LookupDependencies = { store: LookupStore; fetcher: typeof fetch; now: () => Date; enabled: boolean };
const origins = new Set(["https://seonyoungyoo16.github.io", "http://localhost:3000", "http://127.0.0.1:3200"]);
export function providerUrl(query: TravelQuery): string {
  if (query.action === "search") {
    const url = new URL("https://photon.komoot.io/api/"); url.searchParams.set("q", query.query); url.searchParams.set("limit", "5"); return url.toString();
  }
  const coordinates = query.points.map(point => `${point.lon},${point.lat}`).join(";");
  return `https://routing.openstreetmap.de/routed-${query.mode}/route/v1/driving/${coordinates}?overview=false&steps=false&generate_hints=false`;
}
async function readBounded(stream: ReadableStream<Uint8Array> | null, limit: number): Promise<string> {
  if (!stream) return "";
  const reader = stream.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > limit) { await reader.cancel(); throw new RangeError("response too large"); } chunks.push(part.value); }
    const bytes = new Uint8Array(size); let at = 0; for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } finally { reader.releaseLock(); }
}
export async function handleTravelRequest(req: Request, deps: LookupDependencies): Promise<Response> {
  const origin = req.headers.get("origin");
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store", "Vary": "Origin", ...(origin && origins.has(origin) ? { "Access-Control-Allow-Origin": origin } : {}), "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
  const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });
  if (origin && !origins.has(origin)) return reply({ error: "허용되지 않은 사이트예요." }, 403);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return reply({ error: "POST 요청만 지원해요." }, 405);
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return reply({ error: "JSON으로 조회해주세요." }, 415);
  if (!deps.enabled) return reply({ error: "자동 조회를 잠시 쉬고 있어요. 장소와 이동 시간을 직접 입력해주세요." }, 503);
  let query: TravelQuery;
  try { query = parseTravelQuery(await readBounded(req.body, 4096)); }
  catch (error) { return reply({ error: error instanceof RangeError ? "조회 요청은 4KiB까지예요." : "검색어·좌표·이동 수단을 확인해주세요." }, error instanceof RangeError ? 413 : 400); }
  try {
    const provider = query.action === "search" ? "photon" : "osrm";
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(query)));
    const key = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
    const now = deps.now();
    const cached = await deps.store.get(key);
    if (cached && Date.parse(cached.expiresAt) > now.getTime() && validLookupPayload(cached.payload, query)) return reply({ ...cached.payload, cached: true });
    const lease = await deps.store.claim(provider);
    if (!lease) return reply({ error: "조회가 몰렸거나 오늘 조회 한도에 도달했어요. 잠시 후 다시 시도하거나 이동 시간을 직접 입력해주세요.", retryAfterSeconds: 2 }, 429);
    try {
      if (!Number.isFinite(Date.parse(lease.validUntil)) || deps.now().getTime() >= Date.parse(lease.validUntil)) return reply({ error: "조회 대기가 길어졌어요. 다시 시도하거나 이동 시간을 직접 입력해주세요." }, 429);
      const response = await deps.fetcher(providerUrl(query), { signal: AbortSignal.timeout(10000), redirect: "error", headers: { "User-Agent": "oddk-todo/UX08 (https://seonyoungyoo16.github.io/oddk-todo/)", "Accept": "application/json" } });
      if (!response.ok) return reply({ error: "조회 서비스가 응답하지 않아요. 입력은 유지돼요. 잠시 후 다시 조회하거나 직접 입력해주세요." }, response.status === 429 ? 429 : 502);
      const raw: unknown = JSON.parse(await readBounded(response.body, 1000000));
      const queriedAt = now.toISOString();
      const payload: LookupPayload = query.action === "search" ? { action: "search", source: "Photon", queriedAt, places: parsePhoton(raw) } : { action: "route", result: parseOsrm(raw, query, queriedAt) };
      const ttl = provider === "photon" ? 7 * 86400000 : 86400000;
      await deps.store.put(key, provider, payload, queriedAt, new Date(now.getTime() + ttl).toISOString());
      return reply({ ...payload, cached: false });
    } finally { await deps.store.finish(provider, lease.id); }
  } catch { return reply({ error: "조회하지 못했어요. 입력은 유지돼요. 다시 조회하거나 이동 시간을 직접 입력해주세요." }, 503); }
}
