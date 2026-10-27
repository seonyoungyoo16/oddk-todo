import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const url = "https://synxmskamifpovuziecx.supabase.co";
const key = "sb_publishable_ACwZjSLbL_dU9hilmAV7CQ_FEH8AT29";
const [user] = JSON.parse(readFileSync(new URL("../.sync-auth-fixture.json", import.meta.url), "utf8"));
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: auth, error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
assert.equal(error, null);
async function api(body, expected = 200) {
  const r = await fetch(`${url}/functions/v1/${process.env.ODDK_TEST_EDGE_FUNCTION ?? "plan-sync"}`, { method: "POST", headers: { Authorization: `Bearer ${auth.session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const value = await r.json(); assert.equal(r.status, expected, value.error); return value;
}
try {
  const current = await api({ action: "pull" });
  assert.equal(current.plan.schemaVersion, 3);
  const plan = { ...current.plan, tasks: current.plan.tasks.map(t => ({ ...t, notes: "Synthetic detailed note\nsecond line" })) };
  const saved = await api({ action: "push", plan, version: current.version });
  const snapshot = await api({ action: "pull" });
  assert.deepEqual(snapshot.plan, plan); assert.equal(snapshot.version, current.version + 1);
  const v2 = { ...plan, schemaVersion: 2, tasks: plan.tasks.map(({ notes: _notes, ...task }) => task) };
  const v1 = { tasks: v2.tasks.map(({ plannedDate: _date, ...task }) => task), start: v2.start, mandala: v2.mandala };
  for (const old of [v1, v2]) {
    await api({ action: "push", plan: old, version: saved.version }, 426);
    assert.deepEqual(await api({ action: "pull" }), snapshot);
  }
  const invalid = { ...plan, tasks: plan.tasks.map(t => ({ ...t, notes: "x".repeat(2001) })) };
  await api({ action: "push", plan: invalid, version: saved.version }, 400);
  assert.deepEqual(await api({ action: "pull" }), snapshot);
  await api({ action: "push", plan, version: current.version }, 409);
  assert.deepEqual(await api({ action: "pull" }), snapshot);
  console.log("PASS: V3 note round trip, V1/V2 downgrade426, oversized notes400 and stale CAS409 preserve plan/version/updated_at");
} finally { await client.auth.signOut(); }
