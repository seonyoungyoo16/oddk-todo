import test from "node:test";
import assert from "node:assert/strict";
import { selectDay } from "../../app/todo/day-selectors.ts";
const task = (id, plannedDate, minutes, bufferMinutes, extra = {}) => ({ id, title: id, plannedDate, minutes, bufferMinutes, startTime: "09:00", priority: "normal", done: false, ...extra });
const fixture = () => [task("A", "2026-10-27", 60, 10), task("B", "2026-10-28", 30, 5), task("C", null, 100, 20)];
test("selected day totals never include tomorrow or undated tasks", () => {
  const tasks = fixture();
  const today = selectDay(tasks, "2026-10-27"), tomorrow = selectDay(tasks, "2026-10-28");
  assert.deepEqual([today.total, today.work, today.buffer], [60, 50, 10]);
  assert.deepEqual([tomorrow.total, tomorrow.work, tomorrow.buffer], [30, 25, 5]);
  assert.deepEqual(today.tasks.map((task) => task.id), ["A"]);
  assert.equal(selectDay(tasks, "").total, 0);
  assert.equal(selectDay(tasks, "2026-02-30").tasks.length, 0);
  assert.deepEqual(tasks, fixture());
});
test("completion stays in plan statistics but leaves the active timeline", () => {
  const tasks = fixture(); tasks[0].done = true;
  const day = selectDay(tasks, "2026-10-27");
  assert.equal(day.total, 60); assert.equal(day.completedMinutes, 60);
  assert.equal(day.completedCount, 1); assert.equal(day.activeTotal, 0);
  assert.equal(day.scheduled.length, 0);
});
test("only active, valid-time and started tasks are scheduled", () => {
  const tasks = [task("valid", "2026-10-27", 60, 10, { startTime: "23:30", priority: "high" }), task("unset", "2026-10-27", null, null, { startTime: null }), task("unstarted", "2026-10-27", 30, 5, { startTime: null })];
  const day = selectDay(tasks, "2026-10-27");
  assert.deepEqual(day.scheduled.map((task) => [task.id, task.start, task.end]), [["valid", 1410, 1470]]);
  assert.equal(day.untimedCount, 1); assert.equal(day.activeUntimedCount, 1);
  assert.equal(day.byPriority.high, 60); assert.equal(day.highPriorityCount, 1);
  assert.equal(selectDay(tasks, "2026-10-28").total, 0);
});
