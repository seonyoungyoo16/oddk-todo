import test from "node:test";
import assert from "node:assert/strict";
import { taskTimeLabel } from "../../app/todo/task-time-label.ts";
import { updateSimpleTask } from "../../app/todo/simple-task-editor.ts";

const task = (patch = {}) => ({ id: "time-label", title: "시간 표시 확인", notes: "", plannedDate: "2026-10-31", startTime: null, endTime: null, endDate: null, endDayOffset: null, minutes: null, bufferMinutes: null, done: false, priority: "normal", ...patch });

test("saving a duration without a start time displays its total instead of all day", () => {
  const before = { schemaVersion: 5, start: "09:00", reviewsByDate: {}, goalTree: { goal: "", groups: [] }, tasks: [task()] };
  const edited = updateSimpleTask(before, "time-label", { title: "시간 표시 확인", work: "50", buffer: "10", done: false }).tasks[0];
  assert.equal(edited.startTime, null);
  assert.equal(taskTimeLabel(edited), "소요 60분");
  assert.equal(taskTimeLabel(JSON.parse(JSON.stringify(edited))), "소요 60분");
  assert.equal(taskTimeLabel(before.tasks[0]), "종일");
});

test("scheduled tasks keep their clock interval including midnight and next day", () => {
  assert.equal(taskTimeLabel(task({ startTime: "09:00", endTime: "10:00", minutes: 60, bufferMinutes: 10 })), "09:00~10:00");
  assert.equal(taskTimeLabel(task({ startTime: "00:00", endTime: "01:00", minutes: 60, bufferMinutes: 10 })), "00:00~01:00");
  assert.equal(taskTimeLabel(task({ startTime: "23:30", endTime: "00:30", endDayOffset: 1, minutes: 60, bufferMinutes: 10 })), "23:30~다음 날 00:30");
});

test("clearing a configured duration restores the all-day label", () => {
  const before = { schemaVersion: 5, start: "09:00", reviewsByDate: {}, goalTree: { goal: "", groups: [] }, tasks: [task({ minutes: 60, bufferMinutes: 10 })] };
  assert.equal(taskTimeLabel(updateSimpleTask(before, "time-label", { title: "시간 표시 확인", work: "", buffer: "", done: false }).tasks[0]), "종일");
});
