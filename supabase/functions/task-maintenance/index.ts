import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { handleMaintenance } from "./handler.ts";
import type { MaintenanceStore } from "./handler.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
  global: { fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(6000) }) },
});
const store: MaintenanceStore = {
  async claim(hash) {
    const { data, error } = await db.rpc("task_maintenance_claim", { p_hash: hash });
    if (error) throw error;
    return data;
  },
  async batch(lease) {
    const { data, error } = await db.rpc("task_maintenance_batch", { p_lease: lease });
    if (error) throw error;
    return data ?? [];
  },
  async write(lease, user, version, plan) {
    const { data, error } = await db.rpc("task_maintenance_write", { p_lease: lease, p_user: user, p_version: version, p_plan: plan });
    if (error) throw error;
    return data === true;
  },
  async finish(lease, cursor, result) {
    const { data, error } = await db.rpc("task_maintenance_finish", { p_lease: lease, p_cursor: cursor, p_result: result });
    if (error) throw error;
    return data === true;
  },
};
Deno.serve(req => handleMaintenance(req, { store, now: () => new Date() }));
