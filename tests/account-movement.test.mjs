import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { loadPlan } from "../supabase/functions/_shared/plan-migration.ts";
import { dropVisibleTask, previewTimeMove, applyTimeMove } from "../app/todo/task-movement.ts";
import { makeUndo, applyUndo } from "../app/todo/plan-history.ts";
const url = "https://synxmskamifpovuziecx.supabase.co", key = "sb_publishable_ACwZjSLbL_dU9hilmAV7CQ_FEH8AT29";
const users = JSON.parse(readFileSync(new URL("../.sync-auth-fixture.json", import.meta.url), "utf8"));
const clients = users.map(() => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }));
const sessions = await Promise.all(clients.map(async (client, index) => { const { data, error } = await client.auth.signInWithPassword({ email: users[index].email, password: users[index].password }); assert.equal(error, null); return data.session; }));
async function api(body, expected = 200, account = 0) {
  const response = await fetch(`${url}/functions/v1/${process.env.ODDK_TEST_EDGE_FUNCTION ?? "plan-sync"}`, { method: "POST", headers: { Authorization: `Bearer ${sessions[account].access_token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json(); assert.equal(response.status, expected, data.error); return data;
}
try {
  const original = await api({ action: "pull" }), other = await api({ action: "pull" }, 200, 1);
  const loaded = loadPlan(JSON.stringify(original.plan)); assert.equal(loaded.ok, true);
  let saved = await api({ action: "push", plan: loaded.plan, version: original.version });
  const baseline = saved.plan;
  const task = (id, date) => ({ id, title: id, notes: "UX09 isolated movement", done: false, priority: "normal", plannedDate: date, minutes: 60, bufferMinutes: 10, startTime: "09:00", endTime: "10:00", endDate: date, endDayOffset: 0 });
  const fixture = { ...baseline, tasks: [...baseline.tasks, task("qa-move-a", "2026-10-28"), task("qa-move-hidden", "2026-10-29"), task("qa-move-b", "2026-10-28")] };
  saved = await api({ action: "push", plan: fixture, version: saved.version });
  const ordered = dropVisibleTask(fixture, ["qa-move-a", "qa-move-b"], "qa-move-a", "qa-move-b");
  saved = await api({ action: "push", plan: ordered, version: saved.version });
  assert.deepEqual((await api({ action: "pull" })).plan, ordered);
  assert.deepEqual(ordered.tasks.slice(-3).map(t => t.id), ["qa-move-b", "qa-move-hidden", "qa-move-a"]);
  const preview = previewTimeMove(ordered, "qa-move-a", "2026-10-29", "23:30"), moved = applyTimeMove(ordered, preview);
  const beforeMoveVersion = saved.version;
  saved = await api({ action: "push", plan: moved, version: saved.version });
  const pulled = await api({ action: "pull" }); assert.deepEqual(pulled.plan, moved);
  const a = pulled.plan.tasks.find(t => t.id === "qa-move-a");
  assert.equal(a.endDate, "2026-10-30"); assert.equal(a.endTime, "00:30"); assert.equal(a.minutes, 60); assert.equal(a.bufferMinutes, 10);
  assert.deepEqual(pulled.plan.goalTree, baseline.goalTree);
  assert.throws(() => applyTimeMove(pulled.plan, preview), /계획이 바뀌/);
  await api({ action: "push", plan: ordered, version: beforeMoveVersion }, 409); assert.deepEqual(await api({ action: "pull" }), pulled);
  const invalid = { ...moved, tasks: moved.tasks.map(t => t.id === a.id ? { ...t, endDate: t.plannedDate } : t) };
  await api({ action: "push", plan: invalid, version: saved.version }, 400); assert.deepEqual(await api({ action: "pull" }), pulled);
  assert.deepEqual(await api({ action: "pull" }, 200, 1), other);
  saved = await api({ action: "push", plan: applyUndo(saved.plan, makeUndo(ordered, moved, "Move time")), version: saved.version }); assert.deepEqual(saved.plan, ordered);
  saved = await api({ action: "push", plan: applyUndo(saved.plan, makeUndo(fixture, ordered, "Reorder")), version: saved.version }); assert.deepEqual(saved.plan, fixture);
  saved = await api({ action: "push", plan: applyUndo(saved.plan, makeUndo(baseline, fixture, "Fixture")), version: saved.version }); assert.deepEqual(saved.plan, baseline);
  console.log("PASS: UX09 filtered order and midnight time roundtrip; durations/goals preserved; stale409/invalid400 leave complete snapshot/version unchanged; account isolation; time/order/full fixture undo");
} finally { await Promise.all(clients.map(client => client.auth.signOut())); }
