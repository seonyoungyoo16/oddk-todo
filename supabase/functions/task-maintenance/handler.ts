import { validPlan } from "../_shared/plan.ts";
import { prepareRepeatWindow } from "../_shared/repeat-window.ts";
import type { Plan } from "../_shared/plan.ts";

export type MaintenanceLease = { id: string; until: string; cursor: string | null };
export type MaintenanceRow = { user_id: string; plan: unknown; version: number };
export type MaintenanceResult = { scanned: number; prepared: number; unchanged: number; conflicted: number; invalid: number; failed: number };
export type MaintenanceStore = {
  claim: (hash: string) => Promise<MaintenanceLease | null>;
  batch: (lease: string) => Promise<MaintenanceRow[]>;
  write: (lease: string, user: string, version: number, plan: Plan) => Promise<boolean>;
  finish: (lease: string, cursor: string | null, result: MaintenanceResult) => Promise<boolean>;
};
export type MaintenanceDependencies = { store: MaintenanceStore; now: () => Date };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function ticketBody(req: Request): Promise<string | null> {
  const reader = req.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > 256) { await reader.cancel(); return null; }
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    return body && Object.keys(body).length === 1 && typeof body.ticket === "string" && /^[a-f0-9]{64}$/.test(body.ticket) ? body.ticket : null;
  } catch { return null; } finally { reader.releaseLock(); }
}

export async function handleMaintenance(req: Request, deps: MaintenanceDependencies): Promise<Response> {
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  // This endpoint is for the database scheduler only, never a browser API.
  if (req.headers.has("origin")) return reply({ error: "forbidden" }, 403);
  if (req.method !== "POST") return reply({ error: "method" }, 405);
  if (req.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return reply({ error: "json required" }, 415);
  const ticket = await ticketBody(req);
  if (!ticket) return reply({ error: "unauthorized" }, 401);
  try {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ticket));
    const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    const lease = await deps.store.claim(hash);
    if (!lease) return reply({ error: "unauthorized" }, 401);
    if (!uuid.test(lease.id) || !Number.isFinite(Date.parse(lease.until)) || Date.parse(lease.until) <= deps.now().getTime() || (lease.cursor !== null && !uuid.test(lease.cursor))) return reply({ error: "lease expired" }, 409);
    const startedAt = deps.now().getTime();
    const today = new Date(startedAt + 9 * 3600000).toISOString().slice(0, 10);
    const result: MaintenanceResult = { scanned: 0, prepared: 0, unchanged: 0, conflicted: 0, invalid: 0, failed: 0 };
    let cursor = lease.cursor;
    let batchFailed = false;
    try {
      const rows = await deps.store.batch(lease.id);
      // Refuse malformed adapter results instead of processing an unbounded list.
      if (rows.length > 5 || rows.some((row, i) => !uuid.test(row.user_id) || (i > 0 ? row.user_id <= rows[i - 1].user_id : cursor !== null && row.user_id <= cursor))) throw new Error("invalid batch");
      if (rows.length === 0) cursor = null; // End of keyset: next run starts at first account.
      for (const row of rows) {
        // Leave the unprocessed cursor for the next run when runtime budget ends.
        if (deps.now().getTime() - startedAt >= 18000 || Date.parse(lease.until) - deps.now().getTime() <= 2000) break;
        result.scanned++;
        try {
          if (!Number.isSafeInteger(row.version) || row.version < 1 || row.version >= Number.MAX_SAFE_INTEGER || !validPlan(row.plan) || !("schemaVersion" in row.plan) || row.plan.schemaVersion !== 6) { result.invalid++; continue; }
          const next = prepareRepeatWindow(row.plan as Plan, today);
          if (next === row.plan) { result.unchanged++; continue; }
          if (!validPlan(next) || new TextEncoder().encode(JSON.stringify(next)).byteLength > 1000000) { result.failed++; continue; }
          if (await deps.store.write(lease.id, row.user_id, row.version, next)) result.prepared++;
          else result.conflicted++; // Latest plan wins; retry on the next scan, never overwrite.
        } catch { result.failed++; }
        finally { cursor = row.user_id; }
      }
    } catch { batchFailed = true; }
    const finished = await deps.store.finish(lease.id, cursor, result);
    if (!finished) return reply({ error: "lease expired" }, 409);
    // Counts only: no task text, user IDs, tickets or credentials in responses/logs.
    return reply({ ...result, retry: batchFailed }, batchFailed ? 503 : 200);
  } catch { return reply({ error: "maintenance unavailable" }, 503); }
}
