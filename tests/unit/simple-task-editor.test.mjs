import test from "node:test";
import assert from "node:assert/strict";
import { updateSimpleTask } from "../../app/todo/simple-task-editor.ts";
import { validPlan } from "../../supabase/functions/_shared/plan.ts";
import { buildWeeklyTimetable } from "../../app/todo/weekly-timetable-model.ts";

const task = (patch = {}) => ({ id: "a", title: "Original", notes: "Notes", plannedDate: "2026-10-31", startTime: "23:30", endTime: "00:30", endDate: "2026-11-01", endDayOffset: 1, minutes: 60, bufferMinutes: 10, done: false, priority: "high", importance: "normal", dueDate: "2026-11-02", dueTime: "12:00", categoryId: "work", tagIds: ["one"], ...patch });
const plan = (patch = {}) => ({ schemaVersion: 5, start: "09:00", reviewsByDate: {}, categories: [{ id: "work", name: "Work", color: "#123456" }], tags: [{ id: "one", name: "One" }, { id: "two", name: "Two" }], tasks: [task()], goalTree: { goal: "Keep goal", groups: [{ id: "g", title: "Keep group", taskIds: ["a"] }] }, ...patch });
const draft = (patch = {}) => ({ title: "Original", notes: "Notes", tagIds: ["one"], importance: "normal", done: false, work: "50", buffer: "10", ...patch });

test("simplified editor changes only exposed fields and preserves hidden settings and original plan", () => {
  const before = plan(), raw = JSON.stringify(before);
  assert.equal(validPlan(before), true);
  const after = updateSimpleTask(before, "a", draft({ title: "Changed", notes: "Changed notes", tagIds: ["two"], importance: "high", done: true,
    categoryId: null, date: "", start: "", dueDate: "", priority: "low", goalLinks: [], repeat: { action: "stop" }, reminder: "" }));
  assert.equal(after.tasks[0].title, "Changed"); assert.equal(after.tasks[0].notes, "Changed notes");
  assert.deepEqual(after.tasks[0].tagIds, ["two"]); assert.equal(after.tasks[0].importance, "high"); assert.equal(after.tasks[0].done, true);
  for (const key of ["categoryId", "plannedDate", "startTime", "endTime", "endDate", "endDayOffset", "priority", "dueDate", "dueTime"]) assert.deepEqual(after.tasks[0][key], before.tasks[0][key]);
  assert.deepEqual(after.goalTree, before.goalTree); assert.equal(JSON.stringify(before), raw); assert.equal(validPlan(after), true);
});

test("duration edits keep the scheduled start and recompute the end across midnight", () => {
  const after = updateSimpleTask(plan(), "a", draft({ work: "80", buffer: "10" }));
  assert.equal(after.tasks[0].minutes, 90); assert.equal(after.tasks[0].startTime, "23:30");
  assert.equal(after.tasks[0].endTime, "01:00"); assert.equal(after.tasks[0].endDate, "2026-11-01");
  assert.equal(after.tasks[0].plannedDate, "2026-10-31"); assert.equal(validPlan(after), true);
});

test("clearing duration clears dependent clock and reminder without moving the task date", () => {
  const before = plan({ schemaVersion: 6, tasks: [task({ reminderMinutes: 5 })] });
  assert.equal(validPlan(before), true);
  const edited = updateSimpleTask(before, "a", draft({ work: "", buffer: "" })).tasks[0];
  for (const key of ["minutes", "bufferMinutes", "startTime", "endTime", "endDate", "endDayOffset", "reminderMinutes"]) assert.equal(edited[key], null);
  assert.equal(edited.plannedDate, "2026-10-31");
});

test("invalid time, missing tags and duplicate active titles are rejected without mutation", () => {
  const before = plan(), raw = JSON.stringify(before);
  for (const patch of [{ work: "", buffer: "10" }, { work: "240", buffer: "1" }, { work: "1.5" }, { title: " " }, { tagIds: ["missing"] }]) assert.throws(() => updateSimpleTask(before, "a", draft(patch)));
  assert.equal(JSON.stringify(before), raw);
  const duplicate = plan({ tasks: [task(), task({ id: "b", title: "Duplicate" })] });
  assert.throws(() => updateSimpleTask(duplicate, "a", draft({ title: "Duplicate" })), /이미/);
});

test("summary status remains unchanged when editing the available fields", () => {
  const before = plan({ tasks: [task({ summaryOnly: true })] });
  const edited = updateSimpleTask(before, "a", draft({ done: true })).tasks[0];
  assert.equal(edited.done, false); assert.equal(edited.summaryOnly, true);
});

test("setting a start in the list immediately places the same task in the timetable", () => {
  const before = plan({ tasks: [task({ startTime: null, endTime: null, endDate: null, endDayOffset: null, minutes: null, bufferMinutes: null })] });
  const after = updateSimpleTask(before, "a", draft({ work: "50", buffer: "10", schedule: { date: "2026-10-31", start: "10:00" } }));
  const slot = buildWeeklyTimetable(after, "2026-10-31").find(day => day.date === "2026-10-31").tasks[0];
  assert.equal(slot.id, "a"); assert.equal(slot.start, 600); assert.equal(slot.end, 660);
  assert.equal(slot.segmentWork, 50); assert.equal(slot.segmentBuffer, 10);
  assert.equal(after.tasks.length, before.tasks.length); assert.deepEqual(after.goalTree, before.goalTree);
  const moved = updateSimpleTask(after, "a", draft({ schedule: { date: "2026-10-31", start: "11:00" } }));
  assert.equal(buildWeeklyTimetable(moved, "2026-10-31").find(day => day.date === "2026-10-31").tasks[0].start, 660);
});

test("overnight starts derive next-day end and clearing only the start keeps duration and date", () => {
  const scheduled = updateSimpleTask(plan(), "a", draft({ schedule: { date: "2026-10-31", start: "23:45" } }));
  assert.equal(scheduled.tasks[0].endTime, "00:45"); assert.equal(scheduled.tasks[0].endDate, "2026-11-01");
  const cleared = updateSimpleTask(scheduled, "a", draft({ schedule: { date: "2026-10-31", start: "" } }));
  assert.equal(cleared.tasks[0].minutes, 60); assert.equal(cleared.tasks[0].plannedDate, "2026-10-31");
  assert.equal(cleared.tasks[0].startTime, null); assert.equal(cleared.tasks[0].endTime, null);
  assert.equal(buildWeeklyTimetable(cleared, "2026-10-31").flatMap(day => day.tasks).length, 0);
});

test("undated list tasks require an explicit date before timetable placement", () => {
  const before = plan({ tasks: [task({ plannedDate: null, startTime: null, endTime: null, endDate: null, endDayOffset: null })] });
  assert.throws(() => updateSimpleTask(before, "a", draft({ schedule: { start: "10:00", date: "" } })), /날짜/);
  const after = updateSimpleTask(before, "a", draft({ schedule: { start: "10:00", date: "2026-10-31" } }));
  assert.equal(after.tasks[0].plannedDate, "2026-10-31"); assert.equal(validPlan(after), true);
});

test("invalid start or missing duration is rejected without partial writes", () => {
  const before = plan(), raw = JSON.stringify(before);
  for (const schedule of [{ start: "25:00", date: "2026-10-31" }, { start: "10:00", date: "2026-02-30" }]) assert.throws(() => updateSimpleTask(before, "a", draft({ schedule })));
  assert.throws(() => updateSimpleTask(before, "a", draft({ work: "", buffer: "", schedule: { start: "10:00", date: "2026-10-31" } })), /작업 시간/);
  assert.equal(JSON.stringify(before), raw);
});
