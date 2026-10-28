import test from "node:test";
import assert from "node:assert/strict";
import { validPlan } from "../../supabase/functions/_shared/plan.ts";
import { loadPlan } from "../../supabase/functions/_shared/plan-migration.ts";
import { validTaskPlanning, deadlineMinute } from "../../supabase/functions/_shared/task-planning.ts";
import { taskImportance, sortTasks, urgencyLabel, moveVisibleTask, reorderVisibleTasks, selectedTaskSummary } from "../../app/todo/task-order.ts";
import { makeUndo, applyUndo } from "../../app/todo/plan-history.ts";
import { selectDay } from "../../app/todo/day-selectors.ts";
const task = (id, patch = {}) => ({ id, title: id, notes: "", minutes: null, bufferMinutes: null, startTime: null, endTime: null, endDate: null, endDayOffset: null, plannedDate: "2026-10-28", priority: "normal", done: false, ...patch });
const plan = tasks => ({ schemaVersion: 4, start: "09:00", tasks, reviewsByDate: {} });
test("ALPEN and time analysis use importance independently of legacy priority", () => {
  const day = selectDay([task("legacy", { priority: "high", minutes: 60, bufferMinutes: 10 }), task("important", { importance: "high", priority: "low", minutes: 30, bufferMinutes: 5 }), task("done", { importance: "low", minutes: 20, bufferMinutes: 5, done: true })], "2026-10-28");
  assert.deepEqual(day.byImportance, { high: 30, normal: 60, low: 20 });
  assert.equal(day.highImportanceCount, 1); assert.equal(day.highPriorityCount, 1);
  assert.deepEqual(day.byPriority, { high: 60, normal: 20, low: 30 });
});
test("importance and optional deadline do not reinterpret legacy priority or change planning dates", () => {
  const before = plan([task("legacy", { priority: "high" })]);
  const loaded = loadPlan(JSON.stringify(before)); assert.equal(loaded.ok, true);
  assert.deepEqual(loaded.plan, before); assert.equal(taskImportance(loaded.plan.tasks[0]), "normal");
  const next = plan([task("new", { importance: "low", dueDate: "2026-10-30", dueTime: "18:00" })]);
  assert.equal(validPlan(next), true); assert.equal(next.tasks[0].plannedDate, "2026-10-28");
  for (const patch of [{ importance: "urgent" }, { importance: ["high"] }, { importance: null }, { dueDate: "2026-02-29" }, { dueTime: "10:00" }, { dueDate: null, dueTime: "10:00" }, { dueDate: "2026-10-28", dueTime: "24:00" }]) assert.equal(validPlan(plan([task("bad", patch)])), false);
  assert.equal(validTaskPlanning({ dueDate: "2024-02-29", dueTime: null }), true);
});
test("date-only urgency uses next midnight and exact deadlines follow Korean calendar inputs", () => {
  const dateOnly = task("a", { dueDate: "2026-10-28" });
  assert.equal(urgencyLabel(dateOnly, "2026-10-28", "23:59"), "오늘 마감");
  assert.equal(urgencyLabel(dateOnly, "2026-10-29", "00:00"), "마감 지남");
  assert.equal(urgencyLabel(task("b", { dueDate: "2026-10-29", dueTime: "09:00" }), "2026-10-28", "23:59"), "내일 마감");
  assert.equal(urgencyLabel(task("b", { dueDate: "2026-10-28", dueTime: "09:00" }), "2026-10-28", "09:00"), "마감 지남");
  assert.equal(urgencyLabel({ ...dateOnly, done: true }, "2026-10-29", "10:00"), "");
  assert.equal(urgencyLabel(dateOnly, "", ""), "");
  assert.equal(deadlineMinute(task("none")), null);
  assert.equal(deadlineMinute(dateOnly) - deadlineMinute({ ...dateOnly, dueTime: "23:59" }), 1);
});
test("importance and deadline sorts are stable views and never mutate manual order or task data", () => {
  const tasks = [task("manual-first", { priority: "high" }), task("important", { importance: "high", dueDate: "2026-10-30" }), task("urgent", { importance: "low", dueDate: "2026-10-28" }), task("tie"), task("done", { importance: "high", dueDate: "2026-10-27", done: true })];
  const before = structuredClone(tasks);
  assert.deepEqual(sortTasks(tasks, "importance").map(t => t.id), ["important", "manual-first", "tie", "urgent", "done"]);
  assert.deepEqual(sortTasks(tasks, "deadline").map(t => t.id), ["urgent", "important", "manual-first", "tie", "done"]);
  assert.deepEqual(sortTasks(tasks, "manual"), before); assert.deepEqual(tasks, before);
});
test("manual movement only replaces visible ID positions; hidden tasks and undo stay intact", () => {
  const before = plan([task("a"), task("hidden", { plannedDate: "2026-10-29" }), task("b"), task("c")]);
  const moved = moveVisibleTask(before, ["a", "b", "c"], "b", -1);
  assert.deepEqual(moved.tasks.map(t => t.id), ["b", "hidden", "a", "c"]);
  assert.equal(moved.tasks[1], before.tasks[1]); assert.deepEqual([...moved.tasks].sort((a,b)=>a.id.localeCompare(b.id)), [...before.tasks].sort((a,b)=>a.id.localeCompare(b.id)));
  assert.deepEqual(applyUndo(moved, makeUndo(before, moved, "Move")), before);
  assert.equal(moveVisibleTask(before, ["a", "b", "c"], "a", -1), before);
  assert.throws(() => reorderVisibleTasks(before, ["b", "a"], ["a", "b"]));
  assert.throws(() => reorderVisibleTasks(before, ["a", "b"], ["a", "a"]));
  assert.throws(() => reorderVisibleTasks(before, ["a", "missing"], ["missing", "a"]));
});
test("selection counts include hidden dates and distinguish remotely deleted IDs without duplicates", () => {
  const tasks = [task("today"), task("tomorrow", { plannedDate: "2026-10-29" }), task("not-selected")];
  const result = selectedTaskSummary(tasks, ["today", "tomorrow", "gone", "today"], ["today", "not-selected"]);
  assert.deepEqual(result.tasks.map(t => t.id), ["today", "tomorrow"]);
  assert.equal(result.visible, 1); assert.equal(result.hidden, 1); assert.equal(result.missing, 1);
  const filtered = selectedTaskSummary(tasks, ["today", "tomorrow"], []); assert.equal(filtered.hidden, 2); assert.equal(filtered.tasks.length, 2);
});
