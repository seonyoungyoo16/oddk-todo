import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { handlePushWorker } from "./handler.ts";
import type { WorkerStore } from "./handler.ts";
import { encryptedSender } from "./web-push.ts";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false }, global: { fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(6000) }) },
});
const store: WorkerStore = {
  async claimRun(hash) { const { data, error } = await db.rpc("push_worker_claim", { p_hash: hash }); if (error) throw error; return data; },
  async hasWork(now) { const { data, error } = await db.from("push_deliveries").select("id").in("status", ["pending", "sending"]).lte("next_attempt_at", now).limit(1); if (error) throw error; return !!data?.length; },
  async keys() { const { data, error } = await db.rpc("push_vapid_get"); if (error) throw error; return data; },
  async claim(worker) { const { data, error } = await db.rpc("push_worker_deliveries", { p_worker: worker }); if (error) throw error; return data; },
  async current(worker, id, lease) { const { data, error } = await db.rpc("push_worker_current", { p_worker: worker, p_id: id, p_lease: lease }); if (error) throw error; return data; },
  async finish(id, lease, outcome, seconds) { const { data, error } = await db.rpc("push_delivery_finish", { p_id: id, p_lease: lease, p_outcome: outcome, p_retry_seconds: seconds ?? 30 }); if (error) throw error; return data === true; },
  async finishRun(lease, result) { const { data, error } = await db.rpc("push_worker_finish", { p_lease: lease, p_result: result }); if (error) throw error; return data === true; },
};
Deno.serve(req => handlePushWorker(req, { store, send: encryptedSender(fetch), now: () => new Date() }));
