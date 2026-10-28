import { readJsonBounded } from "../_shared/bounded-json.ts";
import { sha256 } from "../_shared/push-subscription.ts";
import { currentReminder } from "../_shared/push-reminder.ts";
import { deliveryPayload, isHexToken, isRecord, isUuid, transportSubscription, validDeliveryClaim, validVapidKeys } from "../_shared/push-delivery.ts";
import type { BrowserPushSubscription } from "../_shared/push-subscription.ts";
import type { DeliveryClaim, PushPayload, VapidKeys } from "../_shared/push-delivery.ts";
export type DeliveryOutcome = "sent" | "retry" | "gone" | "failed" | "invalid" | "removed";
export type WorkerResult = { claimed: number; sent: number; retry: number; gone: number; failed: number; removed: number; invalid: number; lost: number };
export type WorkerStore = {
  claimRun: (hash: string) => Promise<{ id: string; until: string } | null>;
  hasWork: (now: string) => Promise<boolean>;
  keys: () => Promise<unknown>;
  claim: (worker: string) => Promise<unknown[]>;
  current: (worker: string, id: string, lease: string) => Promise<{ plan: unknown; subscription: unknown } | null>;
  finish: (id: string, lease: string, outcome: DeliveryOutcome, retrySeconds?: number) => Promise<boolean>;
  finishRun: (lease: string, result: WorkerResult) => Promise<boolean>;
};
export type PushSender = (subscription: BrowserPushSubscription, keys: VapidKeys, payload: PushPayload, ttl: number, topic: string) => Promise<{ status: number; retryAfter: string | null }>;
export type WorkerDependencies = { store: WorkerStore; send: PushSender; now: () => Date };
export function providerOutcome(status: number, retryAfter: string | null, now: Date, expiresAt: string): { outcome: DeliveryOutcome; retrySeconds?: number } {
  if (status >= 200 && status <= 299) return { outcome: "sent" };
  if (status === 404 || status === 410) return { outcome: "gone" };
  if (status !== 0 && status !== 408 && status !== 429 && !(status >= 500 && status <= 599)) return { outcome: "failed" };
  let delay = 30;
  if (retryAfter && retryAfter.length <= 128) {
    if (/^\d+$/.test(retryAfter)) delay = Number(retryAfter);
    else if (Number.isFinite(Date.parse(retryAfter))) delay = Math.ceil((Date.parse(retryAfter) - now.getTime()) / 1000);
  }
  delay = Math.max(5, delay);
  // Respect a long Retry-After by stopping this short-lived reminder instead
  // of retrying earlier than requested or after it has become irrelevant.
  if (!Number.isFinite(delay) || delay > 60 || now.getTime() + delay * 1000 >= Date.parse(expiresAt)) return { outcome: "failed" };
  return { outcome: "retry", retrySeconds: delay };
}
export async function handlePushWorker(req: Request, deps: WorkerDependencies): Promise<Response> {
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  if (req.headers.has("origin")) return reply({ error: "forbidden" }, 403);
  if (req.method !== "POST") return reply({ error: "method" }, 405);
  if (req.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return reply({ error: "json required" }, 415);
  let ticket;
  try { const body = await readJsonBounded(req, 256); ticket = isRecord(body) && Object.keys(body).length === 1 && isHexToken(body.ticket) ? body.ticket : null; } catch { ticket = null; }
  if (!ticket) return reply({ error: "unauthorized" }, 401);
  try {
    const lease = await deps.store.claimRun(await sha256(ticket));
    if (!lease) return reply({ error: "unauthorized" }, 401);
    if (!isUuid(lease.id) || !Number.isFinite(Date.parse(lease.until)) || Date.parse(lease.until) <= deps.now().getTime()) return reply({ error: "lease expired" }, 409);
    const result: WorkerResult = { claimed: 0, sent: 0, retry: 0, gone: 0, failed: 0, removed: 0, invalid: 0, lost: 0 };
    const started = deps.now().getTime(); let failed = false;
    try {
      if (await deps.store.hasWork(deps.now().toISOString())) {
        const keyData = await deps.store.keys();
        if (!await validVapidKeys(keyData)) throw new Error("Signing unavailable");
        const keys = keyData as VapidKeys;
        const seen = new Set<string>();
        // Five parallel deliveries, at most ten bounded batches per invocation.
        for (let batch = 0; batch < 10 && deps.now().getTime() - started < 18000 && Date.parse(lease.until) - deps.now().getTime() > 5000; batch++) {
          const raw = await deps.store.claim(lease.id);
          if (!Array.isArray(raw) || raw.length > 5 || raw.some(c => !validDeliveryClaim(c) || seen.has(c.id)) || new Set(raw.map(c => (c as DeliveryClaim).id)).size !== raw.length) throw new Error("Invalid claims");
          const claims = raw as DeliveryClaim[]; if (!claims.length) break;
          claims.forEach(c => seen.add(c.id)); result.claimed += claims.length;
          await Promise.all(claims.map(async claim => {
            try {
              const latest = await deps.store.current(lease.id, claim.id, claim.lease);
              let outcome: { outcome: DeliveryOutcome; retrySeconds?: number };
              if (!latest || !currentReminder(latest.plan, claim.taskId, claim, deps.now())) outcome = { outcome: "removed" };
              else {
                const subscription = await transportSubscription(latest.subscription);
                if (!subscription) outcome = { outcome: "invalid" };
                else if (Date.parse(claim.expiresAt) <= deps.now().getTime()) outcome = { outcome: "removed" };
                else {
                  try {
                    const ttl = Math.max(1, Math.min(300, Math.ceil((Date.parse(claim.expiresAt) - deps.now().getTime()) / 1000)));
                    const response = await deps.send(subscription, keys, deliveryPayload(claim), ttl, (await sha256(claim.id)).slice(0, 32));
                    outcome = providerOutcome(response.status, response.retryAfter, deps.now(), claim.expiresAt);
                  } catch { outcome = providerOutcome(0, null, deps.now(), claim.expiresAt); }
                }
              }
              if (await deps.store.finish(claim.id, claim.lease, outcome.outcome, outcome.retrySeconds)) result[outcome.outcome]++;
              else result.lost++;
            } catch { result.lost++; }
          }));
        }
      }
    } catch { failed = true; }
    if (!await deps.store.finishRun(lease.id, result)) return reply({ error: "lease expired" }, 409);
    return reply({ ...result, available: !failed }, failed ? 503 : 200);
  } catch { return reply({ error: "push unavailable" }, 503); }
}
