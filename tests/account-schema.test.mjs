import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { loadPlan } from "../supabase/functions/_shared/plan-migration.ts";
const url = "https://synxmskamifpovuziecx.supabase.co";
const key = "sb_publishable_ACwZjSLbL_dU9hilmAV7CQ_FEH8AT29";
const [user] = JSON.parse(readFileSync(new URL("../.sync-auth-fixture.json", import.meta.url), "utf8"));
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: auth, error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
assert.equal(error, null);
const endpoint = `${url}/functions/v1/${process.env.ODDK_TEST_EDGE_FUNCTION ?? "plan-sync"}`;
async function api(body, expected = 200) {
  const response = await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${auth.session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  assert.equal(response.status, expected); return response.json();
}
try {
  const before = await api({ action: "pull" });
  const loaded = loadPlan(JSON.stringify(before.plan)); assert.equal(loaded.ok, true);
  const plan = { ...loaded.plan, tasks: [{ id: "synthetic-date", title: "Synthetic date", minutes: 30, bufferMinutes: 5, startTime: "09:00", plannedDate: "2026-10-27", priority: "normal", done: false }], reviewsByDate: { "2026-10-27": "Synthetic review" } };
  const saved = await api({ action: "push", plan, version: before.version });
  const v1 = structuredClone(plan); delete v1.schemaVersion; delete v1.reviewsByDate;
  for (const task of v1.tasks) delete task.plannedDate;
  await api({ action: "push", plan: v1, version: saved.version }, 426);
  assert.deepEqual(await api({ action: "pull" }), { ...saved, id: user.id });
  const invalid = structuredClone(plan); invalid.tasks[0].plannedDate = "2026-02-30";
  await api({ action: "push", plan: invalid, version: saved.version }, 400);
  assert.deepEqual(await api({ action: "pull" }), { ...saved, id: user.id });
  console.log("PASS: V2 dates/reviews retained, V1 downgrade=426 and invalid calendar=400 preserve plan/version/updated_at");
} finally { await client.auth.signOut(); }
