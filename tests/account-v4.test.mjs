import { goalTreeFromMandala } from "../supabase/functions/_shared/goal-tree.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { makeUndo, applyUndo } from "../app/todo/plan-history.ts";
const url = "https://synxmskamifpovuziecx.supabase.co";
const key = "sb_publishable_ACwZjSLbL_dU9hilmAV7CQ_FEH8AT29";
const [user] = JSON.parse(readFileSync(new URL("../.sync-auth-fixture.json", import.meta.url), "utf8"));
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: auth, error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
assert.equal(error, null);
async function api(body, expected = 200) {
  const response = await fetch(`${url}/functions/v1/${process.env.ODDK_TEST_EDGE_FUNCTION ?? "plan-sync"}`, { method: "POST", headers: { Authorization: `Bearer ${auth.session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json(); assert.equal(response.status, expected, data.error); return data;
}
try {
  const before = await api({ action: "pull" }); assert.equal(before.plan.schemaVersion, 5);
  const plan = { ...before.plan, tasks: [{ id: "v4-endpoints", title: "Synthetic endpoint plan", notes: "", minutes: 60, bufferMinutes: 10, plannedDate: "2026-10-28", startTime: "09:00", endDate: "2026-10-28", endTime: "10:00", endDayOffset: 0, done: false, priority: "normal" }], availabilityByDate: { "2026-10-28": { start: "09:00", end: "18:00", fixed: [{ id: "lunch", title: "Lunch", start: "12:00", end: "13:00" }] } } };
  plan.goalTree = goalTreeFromMandala(plan.mandala, plan.tasks);
  const saved = await api({ action: "push", plan, version: before.version }); const snapshot = await api({ action: "pull" });
  assert.deepEqual(snapshot.plan, plan); assert.equal(snapshot.version, before.version + 1);
  assert.deepEqual(applyUndo(snapshot.plan, makeUndo(before.plan, plan, "Endpoints and availability")), before.plan);
  for (const patch of [{ endTime: "09:59" }, { endDate: "2026-10-29" }, { endDayOffset: 1 }, { endTime: undefined }, { bufferMinutes: 60 }, { endTime: "13:01", minutes: 241 }]) {
    await api({ action: "push", version: saved.version, plan: { ...plan, tasks: [{ ...plan.tasks[0], ...patch }] } }, 400);
    assert.deepEqual(await api({ action: "pull" }), snapshot);
  }
  const oldV3 = { ...plan, schemaVersion: 3, tasks: plan.tasks.map(task => { const t = { ...task }; delete t.endTime; delete t.endDate; delete t.endDayOffset; return t; }) };
  await api({ action: "push", plan: oldV3, version: saved.version }, 426); assert.deepEqual(await api({ action: "pull" }), snapshot);
  const invalidWindow = { ...plan, availabilityByDate: { "2026-10-28": { start: "18:00", end: "09:00", fixed: [] } } };
  await api({ action: "push", plan: invalidWindow, version: saved.version }, 400); assert.deepEqual(await api({ action: "pull" }), snapshot);
  const midnight = { ...plan, tasks: [{ ...plan.tasks[0], startTime: "23:50", endTime: "00:20", endDate: "2026-10-29", endDayOffset: 1, minutes: 30, bufferMinutes: 5 }] };
  const crossed = await api({ action: "push", plan: midnight, version: saved.version }); assert.deepEqual(crossed.plan, midnight);
  await api({ action: "push", plan, version: saved.version }, 409); assert.deepEqual((await api({ action: "pull" })).plan, midnight);
  console.log("PASS: V4 explicit endpoints/availability JSONB round trip and undo; invalid totals/dates/windows400, V3 downgrade426, midnight explicit save and stale CAS409 preserve latest data");
} finally { await client.auth.signOut(); }
