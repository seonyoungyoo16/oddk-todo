import test from "node:test";
import assert from "node:assert/strict";
import { validPlan } from "../../supabase/functions/_shared/plan.ts";
import { loadPlan, upgradeStoredPlan } from "../../supabase/functions/_shared/plan-migration.ts";
import { goalTreeFromMandala, addGoalGroup } from "../../supabase/functions/_shared/goal-tree.ts";
import { makeUndo, applyUndo, validUndo } from "../../app/todo/plan-history.ts";
import { saveGoalTree, setTaskGoalLinks, deletePlanTasks, splitTask } from "../../app/todo/goal-actions.ts";
import { previewBulkAction, applyBulkAction } from "../../app/todo/bulk-actions.ts";
import { selectDay } from "../../app/todo/day-selectors.ts";
import { taskTouchesDate, taskDaySlice } from "../../app/todo/task-period.ts";
const task = (id, patch = {}) => ({ id, title: id, notes: "Preserve notes", plannedDate: "2026-10-28", minutes: 60, bufferMinutes: 10, startTime: "09:00", endTime: "10:00", endDate: "2026-10-28", endDayOffset: 0, priority: "high", done: false, importance: "low", dueDate: "2026-10-30", dueTime: "12:00", ...patch });
const v4 = () => ({ schemaVersion: 4, tasks: [task("a"), task("b")], start: "09:00", reviewsByDate: { "2026-10-28": "Preserve" }, mandala: { goal: "Original goal", areas: Array.from({ length: 8 }, (_, i) => ({ title: i ? "" : "Original subgoal", taskIds: i ? Array(8).fill("") : ["a", "", "a", "missing", "", "", "", ""] })) }, categories: [{ id: "work", name: "업무", color: "#123456" }], tags: [{ id: "one", name: "태그" }], extension: { original: true } });
const latest = () => loadPlan(JSON.stringify(v4())).plan;
test("V4 to V5 preserves every source property and archive slots while creating canonical goals", () => {
  const before = v4(), raw = JSON.stringify(before), loaded = loadPlan(raw);
  assert.equal(loaded.ok, true); assert.equal(loaded.migrated, true); assert.equal(loaded.plan.schemaVersion, 5);
  for (const [key, value] of Object.entries(before)) if (key !== "schemaVersion") assert.deepEqual(loaded.plan[key], value);
  assert.deepEqual(loaded.plan.goalTree, goalTreeFromMandala(before.mandala, before.tasks));
  assert.deepEqual(loaded.plan.goalTree.groups[0].taskIds, ["a"]); assert.deepEqual(loaded.plan.goalTree.groups[0].missingTaskIds, ["missing"]);
  assert.equal(loadPlan(JSON.stringify(loaded.plan)).migrated, false); assert.equal(JSON.stringify(before), raw);
});
test("before-v5 is durable before replacement, never overwrites old backups and failures keep raw V4", () => {
  const raw = JSON.stringify(v4(), null, 2);
  const memory = () => { const values = new Map([["plan", raw], ["plan.before-v4", "old-v3-bytes"]]); return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }; };
  const store = memory(); upgradeStoredPlan(store, "plan"); assert.equal(store.getItem("plan.before-v5"), raw); assert.equal(store.getItem("plan.before-v4"), "old-v3-bytes");
  const saved = store.getItem("plan"); upgradeStoredPlan(store, "plan"); assert.equal(store.getItem("plan"), saved); assert.equal(store.getItem("plan.before-v5"), raw);
  for (const failAt of ["plan.before-v5", "plan"]) { const broken = memory(), set = broken.setItem; broken.setItem = (key, value) => { if (key === failAt) throw Error("quota"); set(key, value); }; assert.throws(() => upgradeStoredPlan(broken, "plan")); assert.equal(broken.getItem("plan"), raw); }
  const malformed = { ...v4(), goalTree: { unexpected: "retain raw" } }; const text = JSON.stringify(malformed); assert.equal(loadPlan(text).ok, false); assert.equal(loadPlan(text).raw, text);
});
test("V5 requires goal refs and acyclic parent refs and rejects hierarchy semantics on older schemas", () => {
  const plan = latest(); assert.equal(validPlan(plan), true);
  for (const patch of [{ goalTree: undefined }, { goalTree: { goal: "Goal", groups: [{ id: "g", title: "G", taskIds: ["invented"] }] } }, { tasks: plan.tasks.map(t => ({ ...t, parentTaskId: t.id })) }, { tasks: plan.tasks.map(t => ({ ...t, parentTaskId: t.id === "a" ? "b" : "a" })) }, { tasks: plan.tasks.map(t => ({ ...t, parentTaskId: "missing" })) }, { tasks: plan.tasks.map(t => ({ ...t, summaryOnly: "yes" })) }]) assert.equal(validPlan({ ...plan, ...patch }), false);
  assert.equal(validPlan({ ...v4(), tasks: v4().tasks.map(t => ({ ...t, summaryOnly: true })) }), false);
  const chain = Array.from({ length: 5000 }, (_, i) => task(String(i), { parentTaskId: i ? String(i - 1) : null }));
  assert.equal(validPlan({ ...plan, tasks: chain, goalTree: { goal: "Chain", groups: [] } }), true);
});
test("legacy undo without schema metadata restores goals only while migrated goals have not changed", () => {
  const before = v4(), after = { ...before, tasks: before.tasks.slice(1), mandala: { ...before.mandala, areas: before.mandala.areas.map(area => ({ ...area, taskIds: area.taskIds.map(id => id === "a" ? "" : id) })) } };
  const undo = JSON.parse(JSON.stringify(makeUndo(before, after, "Old deletion"))); delete undo.sourceSchema; assert.equal(validUndo(undo), true);
  const current = loadPlan(JSON.stringify(after)).plan; assert.deepEqual(applyUndo(current, undo), loadPlan(JSON.stringify(before)).plan);
  const changed = saveGoalTree(current, addGoalGroup(current.goalTree, "new", "New", current.tasks, current.mandala));
  assert.throws(() => applyUndo(changed, undo), /새 목표 구조/); assert.equal(changed.goalTree.groups.at(-1).id, "new");
});
test("V5 task links, deletion and undo preserve the original archive and unlink parent refs", () => {
  let before = latest(); before = setTaskGoalLinks(before, "b", ["legacy-0", "legacy-1"]);
  before = { ...before, tasks: before.tasks.map(t => t.id === "b" ? { ...t, parentTaskId: "a" } : t) };
  const deleted = deletePlanTasks(before, new Set(["a"])); assert.equal(validPlan(deleted), true); assert.deepEqual(deleted.mandala, before.mandala); assert.equal(deleted.tasks[0].parentTaskId, null);
  assert.equal(deleted.goalTree.groups.some(g => g.taskIds.includes("a")), false); assert.deepEqual(applyUndo(deleted, makeUndo(before, deleted, "Delete")), before);
});
test("splitting keeps source time and links, new IDs and date/category context without invented duration", () => {
  let before = latest(); before = { ...before, tasks: before.tasks.map(t => t.id === "a" ? { ...t, categoryId: "work", tagIds: ["one"] } : t) };
  const original = structuredClone(before.tasks[0]), entries = [{ id: "c", title: "Step C" }, { id: "d", title: "Step D" }];
  const retained = splitTask(before, "a", entries, false), summary = splitTask(before, "a", entries, true);
  assert.deepEqual(summary.tasks[0], { ...original, summaryOnly: true }); assert.deepEqual(before.tasks[0], original);
  for (const child of summary.tasks.slice(2)) { assert.equal(child.parentTaskId, "a"); assert.equal(child.plannedDate, original.plannedDate); assert.equal(child.categoryId, "work"); assert.deepEqual(child.tagIds, ["one"]); assert.equal(child.minutes, null); assert.equal(child.done, false); }
  assert.deepEqual(summary.goalTree.groups[0].taskIds, ["a", "c", "d"]); assert.deepEqual(summary.mandala, before.mandala);
  assert.equal(selectDay(retained.tasks, "2026-10-28").activeTotal, 120); assert.equal(selectDay(summary.tasks, "2026-10-28").activeTotal, 60);
  assert.equal(selectDay(summary.tasks, "2026-10-28").tasks.length, 3); assert.equal(taskDaySlice(summary.tasks[0], "2026-10-28"), null);
  assert.equal(taskTouchesDate(summary.tasks[0], "2026-10-28"), true); assert.deepEqual(applyUndo(summary, makeUndo(before, summary, "Split")), before);
});
test("split rejects duplicates, invalid child IDs and limits atomically; summary completion is excluded", () => {
  const before = latest(), raw = JSON.stringify(before);
  for (const entries of [[{ id: "c", title: "One" }], [{ id: "c", title: "Same" }, { id: "d", title: "same" }], [{ id: "a", title: "New" }, { id: "d", title: "Other" }], [{ id: "c", title: "" }, { id: "d", title: "Other" }]]) assert.throws(() => splitTask(before, "a", entries, true));
  assert.equal(JSON.stringify(before), raw);
  const split = splitTask(before, "a", [{ id: "c", title: "C" }, { id: "d", title: "D" }], true);
  assert.throws(() => previewBulkAction(split, ["a"], [], "done"), /요약/);
  const request = previewBulkAction(split, ["a", "c"], [], "done"); assert.equal(request.excludedSummaries, 1); assert.deepEqual(request.tasks.map(t => t.id), ["c"]);
  const completed = applyBulkAction(split, request); assert.equal(completed.tasks.find(t => t.id === "a").done, false); assert.equal(completed.tasks.find(t => t.id === "c").done, true);
});
