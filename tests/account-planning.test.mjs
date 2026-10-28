import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { moveVisibleTask, sortTasks } from "../app/todo/task-order.ts";
import { previewBulkAction, applyBulkAction } from "../app/todo/bulk-actions.ts";
import { makeUndo, applyUndo } from "../app/todo/plan-history.ts";
const url = "https://synxmskamifpovuziecx.supabase.co", key = "sb_publishable_ACwZjSLbL_dU9hilmAV7CQ_FEH8AT29";
const [user] = JSON.parse(readFileSync(new URL("../.sync-auth-fixture.json", import.meta.url), "utf8"));
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: auth, error } = await client.auth.signInWithPassword({ email: user.email, password: user.password }); assert.equal(error, null);
async function api(body, expected = 200) {
  const response = await fetch(`${url}/functions/v1/${process.env.ODDK_TEST_EDGE_FUNCTION ?? "plan-sync"}`, { method: "POST", headers: { Authorization: `Bearer ${auth.session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json(); assert.equal(response.status, expected, data.error); return data;
}
try {
  const before = await api({ action: "pull" });
  const untimed = (id, date, patch = {}) => ({ id, title: id, notes: "Synthetic", minutes: null, bufferMinutes: null, startTime: null, endTime: null, endDate: null, endDayOffset: null, plannedDate: date, priority: "low", done: false, ...patch });
  const first = { ...before.plan.tasks[0], importance: "high", dueDate: "2026-10-29", dueTime: "12:00", done: false };
  const plan = { ...before.plan, tasks: [first, untimed("planning-next-day", "2026-10-29", { importance: "high", dueDate: "2026-10-29", dueTime: null }), untimed("planning-last", "2026-10-28", { importance: "low", dueDate: "2026-10-28", dueTime: "10:00", priority: "high" })] };
  let saved = await api({ action: "push", plan, version: before.version }); const snapshot = await api({ action: "pull" }); assert.deepEqual(snapshot.plan, plan); assert.equal(snapshot.plan.tasks[0].priority, before.plan.tasks[0].priority);
  for (const patch of [{ importance: "urgent" }, { importance: ["high"] }, { importance: null }, { dueDate: null, dueTime: "09:00" }, { dueDate: "2026-02-29" }, { dueTime: "24:00" }]) { await api({ action: "push", plan: { ...plan, tasks: [{ ...first, ...patch }, ...plan.tasks.slice(1)] }, version: saved.version }, 400); assert.deepEqual(await api({ action: "pull" }), snapshot); }
  assert.deepEqual(sortTasks(snapshot.plan.tasks, "deadline").map(t => t.id), ["planning-last", first.id, "planning-next-day"]); assert.deepEqual((await api({ action: "pull" })).plan, plan);
  const moved = moveVisibleTask(plan, [first.id, "planning-last"], "planning-last", -1);
  saved = await api({ action: "push", plan: moved, version: saved.version }); assert.equal(saved.plan.tasks[1].id, "planning-next-day");
  assert.deepEqual(applyUndo(saved.plan, makeUndo(plan, moved, "Move")), plan);
  const completed = applyBulkAction(saved.plan, previewBulkAction(saved.plan, [first.id, "planning-next-day"], [first.id], "done"));
  saved = await api({ action: "push", plan: completed, version: saved.version }); assert.deepEqual(saved.plan.tasks.filter(t => t.done).map(t => t.id).sort(), [first.id, "planning-next-day"].sort());
  const deleted = applyBulkAction(saved.plan, previewBulkAction(saved.plan, [first.id, "planning-next-day"], [], "delete")), undo = makeUndo(saved.plan, deleted, "Delete two dates");
  saved = await api({ action: "push", plan: deleted, version: saved.version }); const restored = applyUndo(saved.plan, undo);
  saved = await api({ action: "push", plan: restored, version: saved.version }); assert.deepEqual(saved.plan, completed);
  await api({ action: "push", plan, version: before.version }, 409); assert.deepEqual((await api({ action: "pull" })).plan, completed);
  console.log("PASS: importance/deadline JSONB round trip preserves legacy priority, invalid metadata400 preserves snapshot, sorting leaves data, filtered manual order/undo and cross-date bulk complete/delete/restore, stale CAS409");
} finally { await client.auth.signOut(); }
