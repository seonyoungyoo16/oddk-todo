import { parsePushSubscriptionRequest, validPushPoint, sha256 } from "../_shared/push-subscription.ts";
import type { PushDeviceState, BrowserPushSubscription, PushDeviceSummary } from "../_shared/push-subscription.ts";
export type PushDeviceResult = { ok: true; state: PushDeviceState } | { ok: false; error: "binding" | "stale" | "endpoint" | "limit" | "history" };
export type PushSubscriptionStore = {
  config: () => Promise<{ publicKey: string }>;
  devices: (user: string) => Promise<PushDeviceSummary[]>;
  revoke: (user: string, installation: string, revision: number) => Promise<PushDeviceResult>;
  status: (user: string, installation: string, binding: string) => Promise<PushDeviceResult>;
  disable: (user: string, installation: string, binding: string, revision: number) => Promise<PushDeviceResult>;
  register: (user: string, installation: string, binding: string, revision: number, label: string, subscription: BrowserPushSubscription, endpointHash: string) => Promise<PushDeviceResult>;
};
export type PushSubscriptionDependencies = { authenticate: (token: string) => Promise<string | null>; store: PushSubscriptionStore };
const origins = new Set(["https://seonyoungyoo16.github.io", "http://localhost:3000", "http://127.0.0.1:3200"]);
async function readBody(req: Request): Promise<unknown> {
  const reader = req.body?.getReader(); if (!reader) throw new Error("empty");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 4096) { await reader.cancel(); throw new RangeError("size"); } chunks.push(part.value); }
    const data = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(data));
  } finally { reader.releaseLock(); }
}
export async function handlePushSubscription(req: Request, deps: PushSubscriptionDependencies): Promise<Response> {
  const origin = req.headers.get("origin");
  const headers = { "Cache-Control": "no-store", "Vary": "Origin", ...(origin && origins.has(origin) ? { "Access-Control-Allow-Origin": origin } : {}), "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });
  if (origin && !origins.has(origin)) return reply({ error: "허용되지 않은 사이트예요." }, 403);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return reply({ error: "지원하지 않는 요청이에요." }, 405);
  if (req.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return reply({ error: "JSON으로 요청해주세요." }, 415);
  const token = req.headers.get("authorization")?.match(/^Bearer ([^\s]+)$/i)?.[1];
  if (!token || token.length > 8192) return reply({ error: "로그인해주세요." }, 401);
  try {
    const user = await deps.authenticate(token);
    if (!user) return reply({ error: "로그인이 만료됐어요. 다시 로그인해주세요." }, 401);
    let body;
    try { body = parsePushSubscriptionRequest(await readBody(req)); }
    catch (error) { return reply({ error: error instanceof RangeError ? "알림 요청이 너무 커요." : "알림 설정을 확인해주세요." }, error instanceof RangeError ? 413 : 400); }
    if (!body) return reply({ error: "알림 설정을 확인해주세요." }, 400);
    if (body.action === "config") {
      const config = await deps.store.config();
      if (!await validPushPoint(config.publicKey)) throw new Error("Invalid VAPID config");
      return reply({ publicKey: config.publicKey });
    }
    if (body.action === "devices") {
      const devices = await deps.store.devices(user);
      if (!Array.isArray(devices) || devices.length > 20) throw new Error("Invalid push devices");
      const safe = devices.map(({ installationId, revision, label, enabled, updatedAt }) => {
        if (typeof installationId !== "string" || !/^[a-f0-9-]{36}$/.test(installationId) || !Number.isSafeInteger(revision) || revision < 1 || typeof label !== "string" || !label || label.length > 60 || typeof enabled !== "boolean" || typeof updatedAt !== "string" || !Number.isFinite(Date.parse(updatedAt))) throw new Error("Invalid push device");
        return { installationId, revision, label, enabled, updatedAt };
      });
      if (new Set(safe.map(d => d.installationId)).size !== safe.length) throw new Error("Duplicate push device");
      return reply({ devices: safe });
    }
    let result: PushDeviceResult;
    if (body.action === "revoke") result = await deps.store.revoke(user, body.installationId, body.revision);
    else {
      const binding = await sha256(`${body.installationId}:${body.deviceToken}`);
      if (body.action === "status") result = await deps.store.status(user, body.installationId, binding);
      else if (body.action === "disable") result = await deps.store.disable(user, body.installationId, binding, body.revision);
      else {
        if (!await validPushPoint(body.subscription.keys.p256dh)) return reply({ error: "브라우저 구독 키가 올바르지 않아요. 다시 연결해주세요." }, 400);
        result = await deps.store.register(user, body.installationId, binding, body.revision, body.label, body.subscription, await sha256(body.subscription.endpoint));
      }
    }
    if (result.ok) {
      const { revision, enabled, owned, label } = result.state;
      if (!Number.isSafeInteger(revision) || revision < 0 || typeof enabled !== "boolean" || typeof owned !== "boolean" || (label !== null && (typeof label !== "string" || label.length > 60)) || (enabled && !owned) || (!owned && label !== null)) throw new Error("Invalid push state");
      return reply({ revision, enabled, owned, label });
    }
    const message = result.error === "limit" ? "알림은 계정당 최대5개 기기에 연결할 수 있어요. 사용하지 않는 기기의 연결을 먼저 꺼주세요." : result.error === "history" ? "최근 기기 연결 기록이 많아요. 기존 브라우저 연결을 사용해주세요. 꺼진 연결 기록은30일 후 정리돼요." : "알림 연결이 바뀌었어요. 현재 상태를 다시 확인한 뒤 연결해주세요.";
    return reply({ error: message, code: result.error }, result.error === "limit" || result.error === "history" ? 429 : 409);
  } catch { return reply({ error: "알림 설정을 저장하지 못했어요. 다시 확인해주세요." }, 503); }
}
