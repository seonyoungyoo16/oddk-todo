import test from "node:test";
import assert from "node:assert/strict";
import { selectDay } from "../../app/todo/day-selectors.ts";
import { selectRangeTasks } from "../../app/todo/calendar-range.ts";
import { availabilitySummary } from "../../app/todo/availability.ts";
import { layoutTimeline } from "../../app/todo/timeline.ts";
const task = (id, patch = {}) => ({ id, title: id, notes: "", plannedDate: "2026-10-28", startTime: "09:00", minutes: 60, bufferMinutes: 10, priority: "normal", done: false, ...patch });
test("midnight portions share identity without double counting work, buffer or exact-midnight endings", () => {
  const tasks = [task("cross", { startTime: "23:50", minutes: 30, bufferMinutes: 5 }), task("midnight", { startTime: "23:30", minutes: 30, bufferMinutes: 5 })];
  const first = selectDay(tasks, "2026-10-28"), second = selectDay(tasks, "2026-10-29");
  assert.equal(first.total, 40); assert.equal(first.buffer, 5); assert.equal(second.total, 20); assert.equal(second.buffer, 5);
  assert.equal(first.work + second.work, 50); assert.equal(first.total + second.total, 60);
  assert.deepEqual(second.tasks.map(t => t.id), ["cross"]); assert.equal(second.tasks[0], tasks[0]);
  assert.deepEqual(second.scheduled.map(t => [t.id, t.start, t.end, t.segmentWork, t.segmentBuffer, t.continuesBefore]), [["cross", 0, 20, 15, 5, true]]);
  assert.deepEqual(selectRangeTasks(tasks, "2026-10-29", "day").map(t => t.id), ["cross"]);
  assert.equal(selectRangeTasks(tasks, "2026-10-28", "week").length, 2);
});
test("buffer-only carry and completion keep correct statistics while leaving the active timeline", () => {
  const cross = task("buffer", { startTime: "23:50", minutes: 30, bufferMinutes: 25 });
  const second = selectDay([cross], "2026-10-29"); assert.equal(second.work, 0); assert.equal(second.buffer, 20); assert.equal(second.scheduled[0].segmentWork, 0);
  const done = selectDay([{ ...cross, done: true }], "2026-10-29"); assert.equal(done.completedMinutes, 20); assert.equal(done.byPriority.normal, 20); assert.equal(done.activeTotal, 0); assert.equal(done.scheduled.length, 0);
});
test("daily totals, occupied time, fixed breaks and free slots are distinct across hidden tasks", () => {
  const day = selectDay([task("a"), task("b", { startTime: "09:30" }), task("estimate", { startTime: null, minutes: 30, bufferMinutes: 5 }), task("tomorrow", { plannedDate: "2026-10-29" }), task("undated", { plannedDate: null })], "2026-10-28");
  const summary = availabilitySummary(day, { start: "09:00", end: "18:00", fixed: [{ id: "lunch", title: "Lunch", start: "12:00", end: "13:00" }] });
  assert.equal(day.activeTotal, 150); assert.equal(summary.occupiedMinutes, 90); assert.equal(summary.overlapMinutes, 30); assert.equal(summary.fixedMinutes, 60); assert.equal(summary.availableMinutes, 480); assert.equal(summary.freeMinutes, 390); assert.equal(summary.unscheduledMinutes, 30);
  assert.deepEqual(summary.overlaps.map(i => [i.task.id, i.others.map(t => t.id)]), [["a", ["b"]], ["b", ["a"]]]);
});
test("adjacent events are not conflicts; fixed and outside-window conflicts preserve task data", () => {
  const tasks = [task("a"), task("b", { startTime: "10:00" }), task("early", { startTime: "08:30" })], original = structuredClone(tasks);
  const summary = availabilitySummary(selectDay(tasks, "2026-10-28"), { start: "09:00", end: "18:00", fixed: [{ id: "fixed", title: "Meeting", start: "10:00", end: "10:30" }] });
  assert.deepEqual(summary.outside.map(t => t.id), ["early"]); assert.equal(summary.overlaps.find(i => i.task.id === "b").fixed[0].title, "Meeting");
  assert.equal(summary.overlaps.find(i => i.task.id === "b").others.length, 0); assert.deepEqual(tasks, original);
});
test("a day-bounded timeline does not grow past midnight for a late-day segment", () => {
  const timeline = layoutTimeline(selectDay([task("late", { startTime: "23:50", minutes: 30 })], "2026-10-28").scheduled, { start: 540, end: 1080, maxEnd: 1440 });
  assert.equal(timeline.end, 1440); assert.equal(timeline.items[0].end, 1440);
});
