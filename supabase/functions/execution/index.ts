/// <reference lib="deno.ns" />
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { handleExecution } from "./handler.ts";
import type { ExecutionStore } from "./handler.ts";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false }, global: { fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(8000) }) },
});
const store: ExecutionStore = {
  async context(user, target, operation) {
    const { data, error } = await db.rpc("execution_context", { p_user: user, p_target: target, p_operation: operation });
    if (error) throw error; return data;
  },
  async commit(user, request, hash, context, change) {
    const { data, error } = await db.rpc("execution_commit", { p_user: user, p_operation: request.operationId, p_hash: hash, p_kind: request.command.type,
      p_revision: request.revision, p_plan_version: context.planVersion, p_records: change.records, p_active: change.activeId });
    if (error) throw error; return data;
  },
  async history(user, request) {
    const { data, error } = await db.rpc("execution_history", { p_user: user, p_from: request.from, p_to: request.to, p_limit: request.limit,
      p_cursor_time: request.cursor?.startedAt ?? null, p_cursor_id: request.cursor?.id ?? null });
    if (error) throw error; return data;
  },
};
Deno.serve(req => handleExecution(req, { store, authenticate: async token => {
  const { data, error } = await db.auth.getUser(token); return error ? null : data.user?.id ?? null;
} }));
