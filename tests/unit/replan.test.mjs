import test from "node:test";
import assert from "node:assert/strict";
import { loadPlan } from "../../supabase/functions/_shared/plan-migration.ts";
import { defaultReplanPins, previewReplan, validReplanOptions, replanClock, assertCurrentReplan } from "../../supabase/functions/_shared/replan.ts";
import { validPlan } from "../../supabase/functions/_shared/plan.ts";
import { createRecurrence } from "../../supabase/functions/_shared/repeat-actions.ts";
import { applyUndo, makeUndo } from "../../app/todo/plan-history.ts";
const date = "2026-10-29";
const task = (id, patch = {}) => ({ id, title: `Synthetic ${id}`, done: false, priority: "normal", minutes: 30, bufferMinutes: 5, startTime: null, plannedDate: date, ...patch });
function plan(tasks, availability = { start: "09:00", end: "18:00", fixed: [] }) {
  const loaded = loadPlan(JSON.stringify({ schemaVersion: 2, reviewsByDate: {}, start: "09:00", tasks })); assert.equal(loaded.ok, true);
  return { ...loaded.plan, availabilityByDate: { [date]: availability } };
}
const options = (baseMinute = 570, pinnedIds = []) => ({ date, baseMinute, pinnedIds });
test("replanning respects fixed/pinned time, deterministic deadlines/importance/priority and preserves every planned duration", () => {
  const source = plan([task("pinned", { startTime: "11:00", minutes: 60, bufferMinutes: 10 }), task("too-long", { startTime: "08:00", minutes: 60, bufferMinutes: 10, dueDate: date, dueTime: "10:45", importance: "high" }), task("due", { dueDate: date, dueTime: "10:45" }), task("important", { importance: "high" }), task("later", { minutes: 60, bufferMinutes: 10 })], { start: "09:00", end: "18:00", fixed: [{ id: "fixed", title: "Meeting", start: "09:00", end: "10:00" }] });
  const before = JSON.stringify(source), result = previewReplan(source, options(570, ["pinned"]));
  assert.deepEqual(result.errors, []); assert.equal(result.availableMinutes, 420); assert.equal(result.placedMinutes, 120);
  const next = id => result.after.tasks.find(t => t.id === id);
  assert.equal(next("pinned").startTime, "11:00"); assert.equal(next("due").startTime, "10:00"); assert.equal(next("important").startTime, "10:30"); assert.equal(next("later").startTime, "12:00");
  assert.equal(next("too-long").startTime, null); assert.match(result.unplaced[0].reason, /마감/);
  assert.deepEqual(result.after.tasks.map(t => [t.id, t.minutes, t.bufferMinutes]), source.tasks.map(t => [t.id, t.minutes, t.bufferMinutes])); assert.equal(JSON.stringify(source), before); assert.equal(validPlan(result.after), true);
});
test("overlapping/outside protected schedules stop the entire proposal rather than shifting them", () => {
  const source = plan([task("pin", { startTime: "10:00", minutes: 60, bufferMinutes: 10 }), task("move")], { start: "09:00", end: "18:00", fixed: [{ id: "f", title: "Fixed", start: "10:30", end: "11:00" }] });
  let result = previewReplan(source, options(570, ["pin"])); assert.match(result.errors.join(" "), /고정/); assert.deepEqual(result.after, source); assert.deepEqual(result.changes, []);
  const outside = plan([task("outside", { startTime: "18:00", minutes: 60, bufferMinutes: 10 })]);
  result = previewReplan(outside, options(570, ["outside"])); assert.match(result.errors[0], /활동 시간 밖/); assert.deepEqual(result.after, outside);
  const latePin = plan([task("pin", { startTime: "11:00", dueDate: date, dueTime: "10:30" })]); assert.match(previewReplan(latePin, options(570, ["pin"])).errors[0], /마감 이후/);
});
test("completed/other-day/undated tasks stay intact while overdue and untimed work have explicit unplaced reasons", () => {
  const source = plan([task("done", { done: true, startTime: "10:00" }), task("other", { plannedDate: "2026-10-30", startTime: "11:00" }), task("undated", { plannedDate: null }), task("late", { startTime: "08:00", dueDate: "2026-10-28" }), task("unset", { minutes: null, bufferMinutes: null })]);
  const result = previewReplan(source, options());
  for (const id of ["done", "other", "undated"]) assert.deepEqual(result.after.tasks.find(t => t.id === id), source.tasks.find(t => t.id === id));
  assert.match(result.unplaced.find(t => t.task.id === "late").reason, /마감 지남/); assert.match(result.unplaced.find(t => t.task.id === "unset").reason, /미설정/);
  assert.equal(result.after.tasks.find(t => t.id === "late").startTime, null);
});
test("fragmented free time never splits or shrinks a long task and smaller remaining work can still be placed", () => {
  const source = plan([task("long", { minutes: 90, bufferMinutes: 10, importance: "high" }), task("small")], { start: "09:00", end: "12:00", fixed: [{ id: "a", title: "Break", start: "10:00", end: "10:30" }, { id: "b", title: "Meeting", start: "11:00", end: "11:30" }] });
  const result = previewReplan(source, options(540)); assert.match(result.unplaced[0].reason, /90분의 연속/); assert.equal(result.after.tasks[0].minutes, 90); assert.equal(result.after.tasks[1].startTime, "09:00");
});
test("carry-over from yesterday occupies today's remaining time and end-at-midnight is explicit", () => {
  const source = plan([task("carry", { plannedDate: "2026-10-28", startTime: "23:30", minutes: 120, bufferMinutes: 10 }), task("new")], { start: "00:00", end: "24:00", fixed: [] });
  const result = previewReplan(source, options(60)); assert.equal(result.after.tasks[1].startTime, "01:30"); assert.deepEqual(result.after.tasks[0], source.tasks[0]);
  const midnight = previewReplan(plan([task("edge")], { start: "23:00", end: "24:00", fixed: [] }), options(1410)).after.tasks[0];
  assert.equal(midnight.endTime, "00:00"); assert.equal(midnight.endDate, "2026-10-30"); assert.equal(midnight.endDayOffset, 1);
});
test("default pins only protect eligible future times and options cannot reference changed/duplicate/unknown IDs", () => {
  const source = plan([task("future", { startTime: "11:00" }), task("past", { startTime: "08:00" }), task("missing"), task("done", { done: true, startTime: "12:00" })]);
  assert.deepEqual(defaultReplanPins(source, date, 570), ["future"]);
  for (const bad of [{ ...options(), date: "2026-02-30" }, { ...options(), baseMinute: -1 }, { ...options(), baseMinute: 1441 }, { ...options(), pinnedIds: ["future", "future"] }, { ...options(), user: "injected" }]) assert.equal(validReplanOptions(bad), false);
  for (const id of ["gone", "done", "missing"]) assert.throws(() => previewReplan(source, options(570, [id])), /보호/);
});
test("server clock rounds forward safely and expired/day-changed approvals cannot place starts in the past", () => {
  assert.deepEqual(replanClock("2026-10-29T00:30:00.000Z"), { date, minute: 570 });
  assert.deepEqual(replanClock("2026-10-29T00:30:00.001Z"), { date, minute: 571 });
  const result = previewReplan(plan([task("one")]), options(571)); assert.doesNotThrow(() => assertCurrentReplan(result, "2026-10-29T00:30:59.999Z"));
  assert.throws(() => assertCurrentReplan(result, "2026-10-29T00:31:00.001Z"), /다시/); assert.throws(() => assertCurrentReplan(result, "2026-10-30T00:00:00.000Z"), /날짜/);
});
test("at end of activity and maximum calendar date, tasks remain unplaced with their estimates intact", () => {
  let result = previewReplan(plan([task("one")]), options(1440)); assert.match(result.unplaced[0].reason, /시간이 부족/); assert.equal(result.after.tasks[0].minutes, 30);
  const max = "9999-12-31", source = plan([task("limit", { plannedDate: max })]); source.availabilityByDate = { [max]: { start: "23:30", end: "24:00", fixed: [] } };
  result = previewReplan(source, { date: max, baseMinute: 1410, pinnedIds: [] }); assert.match(result.unplaced[0].reason, /지원 범위/); assert.equal(validPlan(result.after), true);
});
test("unplaced repeated work only changes today's occurrence, clears clock-dependent reminders, and undo restores the full source", () => {
  const base = plan([task("routine", { startTime: "09:00", minutes: 60, bufferMinutes: 10 })], { start: "09:00", end: "09:30", fixed: [] });
  base.schemaVersion = 6; base.recurrences = []; base.tasks[0].reminderMinutes = 5;
  base.goalTree = { goal: "Goal", groups: [{ id: "g", title: "Group", taskIds: ["routine"] }] };
  const source = createRecurrence(base, "routine", "routine-series", { frequency: "daily", startDate: date, interval: 1, untilDate: "2026-10-30" }, { from: date, through: "2026-10-30" });
  const before = JSON.stringify(source), result = previewReplan(source, options(540));
  const changed = result.after.tasks.find(t => t.id === "routine"); assert.equal(changed.startTime, null); assert.equal(changed.minutes, 60); assert.equal(changed.reminderMinutes, null); assert.equal(changed.repeatException, true);
  assert.match(result.changes[0].reason, /알림 해제/); assert.deepEqual(result.after.tasks[1], source.tasks[1]); assert.deepEqual(result.after.recurrences, source.recurrences); assert.deepEqual(result.after.goalTree, source.goalTree);
  assert.equal(JSON.stringify(source), before); assert.equal(validPlan(result.after), true); assert.deepEqual(applyUndo(result.after, makeUndo(source, result.after, "Replan")), source);
});
