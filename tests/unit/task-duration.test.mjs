import test from "node:test";
import assert from "node:assert/strict";
import { applyTaskDuration, previewTaskDuration, durationAfterDrag } from "../../app/todo/task-duration.ts";
import { validPlan } from "../../supabase/functions/_shared/plan.ts";
import { makeUndo, applyUndo } from "../../app/todo/plan-history.ts";
import { buildWeeklyTimetable } from "../../app/todo/weekly-timetable-model.ts";
import { repeatTemplateFrom } from "../../supabase/functions/_shared/recurrence.ts";

const task = (id, patch = {}) => ({ id, title: id, notes: "Keep memo", plannedDate: "2026-10-31", startTime: "09:00", endTime: "10:00", endDate: "2026-10-31", endDayOffset: 0, minutes: 60, bufferMinutes: 10, done: false, priority: "high", importance: "high", ...patch });
const plan = (patch = {}) => ({ schemaVersion: 5, tasks: [task("a"), task("other", { startTime: "12:00", endTime: "13:00" })], start: "09:00", reviewsByDate: {}, goalTree: { goal: "Keep goal", groups: [{ id: "g", title: "Keep group", taskIds: ["a"] }] }, ...patch });

test("resize changes work and end only, preserves buffer and all task data, and supports undo", () => {
  const before = plan(), raw = JSON.stringify(before), preview = previewTaskDuration(before, "a", 90);
  assert.deepEqual(preview.warnings, []);
  const after = applyTaskDuration(before, preview);
  assert.deepEqual(after.tasks[0], { ...before.tasks[0], minutes: 90, endTime: "10:30" });
  assert.deepEqual(after.tasks[1], before.tasks[1]); assert.deepEqual(after.goalTree, before.goalTree);
  assert.equal(validPlan(after), true); assert.equal(JSON.stringify(before), raw);
  assert.deepEqual(applyUndo(after, makeUndo(before, after, "Resize")), before);
  assert.equal(applyTaskDuration(after, previewTaskDuration(after, "a", 30)).tasks[0].endTime, "09:30");
});

test("drag snaps in five minute steps and clamps at one work minute plus existing buffer and 240 total", () => {
  assert.equal(durationAfterDrag(60, 10, 13), 75); assert.equal(durationAfterDrag(60, 10, -13), 45);
  assert.equal(durationAfterDrag(60, 10, -999), 11); assert.equal(durationAfterDrag(60, 10, 999), 240);
  assert.equal(durationAfterDrag(63, 8, 0), 63); assert.equal(durationAfterDrag(63, 8, 5), 68);
  for (const delta of [NaN, Infinity, -Infinity]) assert.throws(() => durationAfterDrag(60, 10, delta));
  assert.throws(() => durationAfterDrag(60, 60, 5));
});

test("resize crosses month and midnight, splits the right days and marks recurring occurrence as an exception", () => {
  const source = task("a", { startTime: "23:00", endTime: "00:00", endDate: "2026-11-01", endDayOffset: 1 });
  const before = plan({ schemaVersion: 6, tasks: [{ ...source, repeatSeriesId: "series", repeatDate: source.plannedDate }], recurrences: [{ id: "series", originTaskId: "a", originDate: source.plannedDate, segments: [{ fromDate: source.plannedDate, rule: null, template: repeatTemplateFrom(source) }], skippedDates: [], goalGroupIds: ["g"] }] });
  const extended = applyTaskDuration(before, previewTaskDuration(before, "a", 90));
  assert.equal(extended.tasks[0].endDate, "2026-11-01"); assert.equal(extended.tasks[0].endTime, "00:30");
  assert.equal(extended.tasks[0].repeatException, true);
  const days = buildWeeklyTimetable(extended, "2026-10-31");
  assert.equal(days[5].tasks[0].continuesAfter, true); assert.equal(days[6].tasks[0].segmentMinutes, 30);
  assert.equal(days[6].tasks[0].segmentBuffer, 10);
  const shortened = applyTaskDuration(extended, previewTaskDuration(extended, "a", 30));
  assert.equal(shortened.tasks[0].endDate, "2026-10-31"); assert.equal(shortened.tasks[0].endDayOffset, 0);
  assert.equal(shortened.tasks[0].endTime, "23:30");
});

test("resize warnings include hidden tasks, fixed blocks, outside hours and the following date", () => {
  const before = plan();
  before.tasks[1] = task("hidden", { startTime: "10:15", endTime: "11:15" });
  before.availabilityByDate = { "2026-10-31": { start: "09:00", end: "18:00", fixed: [{ id: "f", title: "Break", start: "10:30", end: "11:00" }] } };
  const warnings = previewTaskDuration(before, "a", 120).warnings;
  assert.ok(warnings.some(w => w.includes("hidden"))); assert.ok(warnings.some(w => w.includes("Break")));
  assert.deepEqual(previewTaskDuration(before, "a", 30).warnings, []);
  const night = plan({ tasks: [task("a", { startTime: "23:00", endTime: "00:00", endDate: "2026-11-01", endDayOffset: 1 })] });
  assert.equal(previewTaskDuration(night, "a", 90).warnings.some(w => w.includes("활동 시간 밖")), false);
  night.availabilityByDate = { "2026-11-01": { start: "09:00", end: "18:00", fixed: [] } };
  assert.ok(previewTaskDuration(night, "a", 90).warnings.some(w => w.includes("2026-11-01") && w.includes("활동 시간 밖")));
});

test("invalid, stale and forged resizes never mutate the plan", () => {
  const before = plan(), raw = JSON.stringify(before), preview = previewTaskDuration(before, "a", 90);
  for (const minutes of [0, 10, 60, 241, 12.5, NaN, Infinity, null]) assert.throws(() => previewTaskDuration(before, "a", minutes));
  assert.throws(() => previewTaskDuration(before, "missing", 90));
  assert.throws(() => previewTaskDuration(plan({ tasks: [task("a", { done: true })] }), "a", 90));
  assert.throws(() => previewTaskDuration(plan({ tasks: [task("a", { minutes: null, bufferMinutes: null, startTime: null, endTime: null, endDate: null, endDayOffset: null })] }), "a", 90));
  assert.throws(() => previewTaskDuration(plan({ tasks: [task("a", { plannedDate: "9999-12-31", startTime: "23:00", endTime: "23:30", endDate: "9999-12-31", minutes: 30 })] }), "a", 90));
  assert.throws(() => applyTaskDuration({ ...before, start: "08:00" }, preview), /계획이 바뀌/);
  assert.throws(() => applyTaskDuration(before, { ...preview, after: { ...preview.after, bufferMinutes: 20 } }), /미리보기/);
  assert.throws(() => applyTaskDuration(before, { ...preview, warnings: ["forged"] }), /미리보기/);
  assert.throws(() => applyTaskDuration(applyTaskDuration(before, preview), preview));
  assert.equal(JSON.stringify(before), raw);
});
