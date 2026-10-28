import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { loadPlan } from "../supabase/functions/_shared/plan-migration.ts";
import { goalTreeProjection, addGoalGroup, removeGoalGroup } from "../supabase/functions/_shared/goal-tree.ts";
import { saveGoalTree, setTaskGoalLinks, splitTask, deletePlanTasks } from "../app/todo/goal-actions.ts";
import { makeUndo, applyUndo } from "../app/todo/plan-history.ts";
const url = "https://synxmskamifpovuziecx.supabase.co", key = "sb_publishable_ACwZjSLbL_dU9hilmAV7CQ_FEH8AT29";
const [, user] = JSON.parse(readFileSync(new URL("../.sync-auth-fixture.json", import.meta.url), "utf8"));
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: auth, error } = await client.auth.signInWithPassword({ email: user.email, password: user.password }); assert.equal(error, null);
async function api(body, expected = 200) {
  const response = await fetch(`${url}/functions/v1/${process.env.ODDK_TEST_EDGE_FUNCTION ?? "plan-sync"}`, { method: "POST", headers: { Authorization: `Bearer ${auth.session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json(); assert.equal(response.status, expected, data.error); return data;
}
try {
  const before = await api({ action: "pull" });
  const old = { schemaVersion: 4, tasks: [{ id: "root", title: "Synthetic goal root", notes: "Original notes", plannedDate: "2026-10-28", minutes: 60, bufferMinutes: 10, startTime: "09:00", endTime: "10:00", endDate: "2026-10-28", endDayOffset: 0, priority: "high", done: false }], start: "09:00", reviewsByDate: { "2026-10-28": "Keep review" }, mandala: { goal: "Original 8x8 goal", areas: Array.from({ length: 8 }, (_, index) => ({ title: `Original ${index}`, taskIds: index ? Array(8).fill("") : ["root", "", "root", "orphan", "", "", "", ""] })) } };
  let saved = await api({ action: "push", plan: old, version: before.version }); assert.deepEqual(saved.plan, old);
  const migrated = loadPlan(JSON.stringify(old)); assert.equal(migrated.ok, true); assert.equal(migrated.plan.schemaVersion, 5);
  saved = await api({ action: "push", plan: migrated.plan, version: saved.version }); const initial = await api({ action: "pull" }); assert.deepEqual(initial.plan, migrated.plan); assert.deepEqual(initial.plan.mandala, old.mandala); assert.deepEqual(initial.plan.goalTree.groups[0].missingTaskIds, ["orphan"]);
  for (const invalid of [{ ...initial.plan, goalTree: undefined }, { ...initial.plan, goalTree: { goal: "Bad", groups: [{ id: "bad", title: "Bad", taskIds: ["missing"] }] } }, { ...initial.plan, goalTree: { ...initial.plan.goalTree, groups: Array.from({ length: 33 }, (_, i) => ({ id: String(i), title: "Group", taskIds: [] })) } }, { ...initial.plan, tasks: initial.plan.tasks.map(task => ({ ...task, parentTaskId: task.id })) }, { ...initial.plan, tasks: initial.plan.tasks.map(task => ({ ...task, summaryOnly: "yes" })) }]) { await api({ action: "push", plan: invalid, version: saved.version }, 400); assert.deepEqual(await api({ action: "pull" }), initial); }
  await api({ action: "push", plan: old, version: saved.version }, 426); assert.deepEqual(await api({ action: "pull" }), initial);
  let tree = addGoalGroup(initial.plan.goalTree, "ninth", "Ninth group is retained", initial.plan.tasks, initial.plan.mandala);
  let expanded = saveGoalTree(initial.plan, tree); expanded = setTaskGoalLinks(expanded, "root", ["legacy-0", "ninth"]);
  assert.equal(goalTreeProjection(expanded.goalTree), null);
  saved = await api({ action: "push", plan: expanded, version: saved.version }); assert.deepEqual(saved.plan.goalTree, expanded.goalTree); assert.deepEqual(saved.plan.mandala, old.mandala);
  const removedGroup = saveGoalTree(saved.plan, removeGoalGroup(saved.plan.goalTree, "ninth")), groupUndo = makeUndo(saved.plan, removedGroup, "Remove group");
  saved = await api({ action: "push", plan: removedGroup, version: saved.version }); assert.equal(saved.plan.tasks.length, 1); const restoredGroup = applyUndo(saved.plan, groupUndo);
  saved = await api({ action: "push", plan: restoredGroup, version: saved.version }); assert.deepEqual(saved.plan, expanded);
  const divided = splitTask(saved.plan, "root", [{ id: "step-a", title: "Step A" }, { id: "step-b", title: "Step B" }], true);
  saved = await api({ action: "push", plan: divided, version: saved.version }); assert.equal(saved.plan.tasks[0].minutes, 60); assert.equal(saved.plan.tasks[0].summaryOnly, true); assert.equal(saved.plan.tasks[1].minutes, null); assert.equal(saved.plan.tasks[1].parentTaskId, "root"); assert.deepEqual(saved.plan.mandala, old.mandala);
  const deleted = deletePlanTasks(saved.plan, new Set(["root"])), undo = makeUndo(saved.plan, deleted, "Delete summary");
  saved = await api({ action: "push", plan: deleted, version: saved.version }); assert.equal(saved.plan.tasks.length, 2); assert.equal(saved.plan.tasks[0].parentTaskId, null);
  const restored = applyUndo(saved.plan, undo); saved = await api({ action: "push", plan: restored, version: saved.version }); assert.deepEqual(saved.plan, divided);
  await api({ action: "push", plan: expanded, version: initial.version }, 409); assert.deepEqual((await api({ action: "pull" })).plan, divided);
  console.log("PASS: V4→V5 archive/duplicate/orphan refs preserved, invalid goal/parent metadata400 and oldV4 writes426 preserve snapshot, ninth group retained and delete/undo keeps tasks, split/summary time preserved, parent deletion/undo and stale CAS409");
} finally { await client.auth.signOut(); }
