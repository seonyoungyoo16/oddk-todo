import { readJsonBounded } from "../_shared/bounded-json.ts";
import { isRecord, parseReceiptRequest } from "../_shared/push-delivery.ts";
import type { ReceiptRequest } from "../_shared/push-delivery.ts";
import { sha256 } from "../_shared/push-subscription.ts";
import { currentReminder } from "../_shared/push-reminder.ts";
export type ReceiptStore = { authorize: (request: ReceiptRequest, receiptHash: string, bindingHash: string, action: "check" | "ack") => Promise<unknown> };
export type ReceiptDependencies = { store: ReceiptStore; now: () => Date };
const origins = new Set(["https://seonyoungyoo16.github.io", "http://localhost:3000", "http://127.0.0.1:3200"]);
export async function handlePushReceipt(req: Request, deps: ReceiptDependencies): Promise<Response> {
  const origin = req.headers.get("origin");
  const headers = { "Cache-Control": "no-store", "Vary": "Origin", ...(origin && origins.has(origin) ? { "Access-Control-Allow-Origin": origin } : {}), "Access-Control-Allow-Headers": "content-type, apikey", "Access-Control-Allow-Methods": "POST, OPTIONS" };
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });
  if (origin && !origins.has(origin)) return reply({ error: "forbidden" }, 403);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return reply({ error: "method" }, 405);
  if (req.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return reply({ error: "json required" }, 415);
  let body;
  try { body = parseReceiptRequest(await readJsonBounded(req, 1024)); }
  catch (error) { return reply({ error: "invalid receipt" }, error instanceof RangeError ? 413 : 400); }
  if (!body) return reply({ error: "invalid receipt" }, 400);
  try {
    const receiptHash = await sha256(body.receiptToken), bindingHash = await sha256(`${body.installationId}:${body.deviceToken}`);
    const data = await deps.store.authorize(body, receiptHash, bindingHash, "check");
    if (!isRecord(data) || data.userId !== body.userId || data.installationId !== body.installationId || data.revision !== body.revision || typeof data.taskId !== "string" || typeof data.displayed !== "boolean" || typeof data.startAt !== "string" || typeof data.dueAt !== "string" || typeof data.expiresAt !== "string") return reply({ error: "receipt unavailable" }, 410);
    const task = currentReminder(data.plan, data.taskId, { startAt: data.startAt, dueAt: data.dueAt, expiresAt: data.expiresAt }, deps.now());
    if (!task) return reply({ error: "receipt unavailable" }, 410);
    if (body.action === "ack") {
      const ack = await deps.store.authorize(body, receiptHash, bindingHash, "ack");
      if (!isRecord(ack) || ack.userId !== body.userId || ack.installationId !== body.installationId || ack.revision !== body.revision) return reply({ error: "receipt unavailable" }, 410);
      return reply({ ok: true });
    }
    if (data.displayed) return reply({ displayed: true });
    return reply({ displayed: false, title: task.title, date: task.plannedDate, startAt: new Date(data.startAt).toISOString(), expiresAt: new Date(data.expiresAt).toISOString() });
  } catch { return reply({ error: "receipt unavailable" }, 503); }
}
