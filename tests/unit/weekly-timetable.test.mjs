import test from "node:test";
import assert from "node:assert/strict";
import { buildWeeklyTimetable, timetableTone, timetablePastels, previewTimetablePlacement, applyTimetablePlacement, previewNewTimetableTask, applyNewTimetableTask, timetableDragOffset } from "../../app/todo/weekly-timetable-model.ts";
import { validPlan } from "../../supabase/functions/_shared/plan.ts";
import { shiftStart, previewTimeMove, applyTimeMove } from "../../app/todo/task-movement.ts";
import { timetableDropMinute } from "../../app/todo/timetable-drag.ts";
import { createRecurrence } from "../../supabase/functions/_shared/repeat-actions.ts";

const task = (id, patch = {}) => ({ id, title: id, notes: "Keep memo", plannedDate: "2026-10-26", startTime: "09:00", endTime: "10:00", endDate: "2026-10-26", endDayOffset: 0, minutes: 60, bufferMinutes: 10, done: false, priority: "high", importance: "normal", ...patch });
const plan = (patch = {}) => ({ schemaVersion: 5, tasks: [task("a")], start: "09:00", reviewsByDate: {}, goalTree: { goal: "Keep goal", groups: [{ id: "g", title: "Keep group", taskIds: ["a"] }] }, ...patch });

test("list drop snaps to the column's five minute time even after vertical scrolling", () => {
  assert.equal(timetableDropMinute(425, -210, 1), 635);
  assert.equal(timetableDropMinute(226, -210, 1), 435);
  assert.equal(timetableDropMinute(450, -600, 2), 525);
  assert.equal(timetableDropMinute(-10, 100, 1), 0);
  assert.equal(timetableDropMinute(2000, 0, 1), 1435);
  for (const values of [[NaN, 0, 1], [10, Infinity, 1], [10, 0, 0], [10, 0, -1]]) assert.throws(() => timetableDropMinute(...values));
});

test("dropping an untimed task sets ALPEN duration on the same ID without duplicating it or changing links", () => {
  const before = plan({ tasks: [task("a", { minutes: null, bufferMinutes: null, startTime: null, endTime: null, endDate: null, endDayOffset: null })] });
  const raw = JSON.stringify(before);
  const preview = previewTimetablePlacement(before, "a", "2026-10-31", "23:50", { minutes: 45, bufferMinutes: 10 });
  assert.equal(JSON.stringify(before), raw);
  const after = applyTimetablePlacement(before, preview);
  assert.equal(after.tasks.length, 1); assert.equal(after.tasks[0].id, "a");
  assert.equal(after.tasks[0].startTime, "23:50"); assert.equal(after.tasks[0].endTime, "00:35");
  assert.equal(after.tasks[0].endDate, "2026-11-01"); assert.equal(after.tasks[0].minutes, 45); assert.equal(after.tasks[0].bufferMinutes, 10);
  assert.equal(after.tasks[0].notes, before.tasks[0].notes); assert.equal(after.tasks[0].priority, before.tasks[0].priority);
  assert.deepEqual(after.goalTree, before.goalTree); assert.equal(validPlan(after), true);
});

test("placement keeps an existing duration and marks only the dragged repeat occurrence as an exception", () => {
  const before = createRecurrence(plan({ tasks: [task("a"), task("other")] }), "a", "series", { frequency: "daily", startDate: "2026-10-26", untilDate: "2026-10-26", interval: 1 }, { from: "2026-10-26", through: "2026-10-26" });
  const preview = previewTimetablePlacement(before, "a", "2026-11-01", "11:15", { minutes: 30, bufferMinutes: 5 });
  assert.equal(preview.after.minutes, 60); assert.equal(preview.after.bufferMinutes, 10);
  assert.equal(preview.after.repeatException, true);
  assert.deepEqual(applyTimetablePlacement(before, preview).tasks[1], before.tasks[1]);
});

test("untimed placement rejects invalid duration, concurrent edits, deleted tasks and forged content atomically", () => {
  const before = plan({ tasks: [task("a", { minutes: null, bufferMinutes: null, startTime: null, endTime: null, endDate: null, endDayOffset: null })] });
  const raw = JSON.stringify(before);
  for (const duration of [{ minutes: 30, bufferMinutes: 0 }, { minutes: 30, bufferMinutes: 30 }, { minutes: 241, bufferMinutes: 5 }, { minutes: 30.5, bufferMinutes: 5 }]) assert.throws(() => previewTimetablePlacement(before, "a", "2026-10-31", "10:00", duration));
  const preview = previewTimetablePlacement(before, "a", "2026-10-31", "10:00", { minutes: 30, bufferMinutes: 5 });
  assert.throws(() => applyTimetablePlacement({ ...before, tasks: [] }, preview));
  assert.throws(() => applyTimetablePlacement({ ...before, tasks: [{ ...before.tasks[0], notes: "Changed" }] }, preview));
  assert.throws(() => applyTimetablePlacement(before, { ...preview, after: { ...preview.after, title: "Forged" } }));
  assert.equal(JSON.stringify(before), raw);
});

test("weekly grid uses Monday through Sunday, including empty days and dates across months", () => {
  const before = plan(), raw = JSON.stringify(before);
  const week = buildWeeklyTimetable(before, "2026-10-31");
  assert.deepEqual(week.map(day => day.date), ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"]);
  assert.equal(week[0].tasks[0].id, "a"); assert.equal(week[6].tasks.length, 0);
  assert.equal(JSON.stringify(before), raw); assert.deepEqual(buildWeeklyTimetable(before, "invalid"), []);
});

test("midnight tasks are split into the right dates with exact work and buffer portions", () => {
  const before = plan({ tasks: [task("a", { plannedDate: "2026-11-01", startTime: "23:30", endTime: "01:00", endDate: "2026-11-02", endDayOffset: 1, minutes: 90 })] });
  assert.equal(validPlan(before), true);
  const sunday = buildWeeklyTimetable(before, "2026-11-01")[6].tasks[0];
  const monday = buildWeeklyTimetable(before, "2026-11-02")[0].tasks[0];
  assert.equal(sunday.segmentMinutes, 30); assert.equal(sunday.continuesAfter, true);
  assert.equal(monday.segmentWork, 50); assert.equal(monday.segmentBuffer, 10); assert.equal(monday.continuesBefore, true);
});

test("overlap lanes stay visible and filtered-out tasks still contribute conflict warnings", () => {
  const before = plan({ tasks: [task("a"), task("hidden", { startTime: "09:30", endTime: "10:30" })] });
  const shown = buildWeeklyTimetable(before, "2026-10-26")[0].tasks;
  assert.equal(shown.length, 2); assert.equal(shown[0].columns, 2); assert.equal(shown[1].lane, 1);
  const filtered = buildWeeklyTimetable(before, "2026-10-26", [before.tasks[0]])[0].tasks;
  assert.equal(filtered.length, 1); assert.equal(filtered[0].conflict, true);
});

test("pastel colors are stable for the same task, category, and recurring series", () => {
  assert.equal(timetablePastels.length, 6);
  assert.equal(timetableTone(task("a")), timetableTone(task("a", { startTime: "12:00" })));
  assert.equal(timetableTone(task("a", { categoryId: "work" })), timetableTone(task("b", { categoryId: "work" })));
  assert.equal(timetableTone(task("a", { repeatSeriesId: "series" })), timetableTone(task("b", { repeatSeriesId: "series" })));
  for (let i = 0; i < 30; i++) assert.ok(timetableTone(task(String(i))) >= 0 && timetableTone(task(String(i))) < 6);
});

test("placing an unscheduled task preserves its duration, memo, goals, and other tasks", () => {
  const before = plan({ tasks: [task("a", { plannedDate: null, startTime: null, endTime: null, endDate: null, endDayOffset: null }), task("other")] });
  const raw = JSON.stringify(before), preview = previewTimetablePlacement(before, "a", "2026-10-31", "23:30");
  const after = applyTimetablePlacement(before, preview);
  assert.equal(after.tasks[0].startTime, "23:30"); assert.equal(after.tasks[0].endTime, "00:30"); assert.equal(after.tasks[0].endDate, "2026-11-01");
  assert.equal(after.tasks[0].minutes, 60); assert.equal(after.tasks[0].bufferMinutes, 10); assert.equal(after.tasks[0].notes, "Keep memo");
  assert.deepEqual(after.goalTree, before.goalTree); assert.deepEqual(after.tasks[1], before.tasks[1]); assert.equal(JSON.stringify(before), raw); assert.equal(validPlan(after), true);
});

test("placement previews expose clashes and reject stale, forged, untimed, completed, and invalid inputs", () => {
  const before = plan({ tasks: [task("a"), task("other")] });
  const preview = previewTimetablePlacement(before, "a", "2026-10-26", "09:30");
  assert.ok(preview.warnings.some(warning => warning.includes("시간 겹침")));
  assert.throws(() => applyTimetablePlacement({ ...before, start: "08:00" }, preview));
  assert.throws(() => applyTimetablePlacement(before, { ...preview, warnings: [] }));
  assert.throws(() => previewTimetablePlacement(before, "a", "bad", "09:00"));
  assert.throws(() => previewTimetablePlacement(before, "a", "2026-10-26", "24:00"));
  assert.throws(() => previewTimetablePlacement(plan({ tasks: [task("a", { done: true })] }), "a", "2026-10-26", "09:00"));
  assert.throws(() => previewTimetablePlacement(plan({ tasks: [task("a", { minutes: null, bufferMinutes: null, startTime: null, endTime: null, endDate: null, endDayOffset: null })] }), "a", "2026-10-26", "09:00"));
});

const newDraft = (patch = {}) => ({ id: "new", title: "New task", notes: "New notes", date: "2026-11-01", time: "23:50", work: "25", buffer: "5", categoryId: null, tagIds: [], ...patch });

test("new timetable task uses the clicked date and clock, keeps ALPEN work and buffer, and preserves existing data", () => {
  const before = plan(), raw = JSON.stringify(before);
  const preview = previewNewTimetableTask(before, newDraft()), after = applyNewTimetableTask(before, preview);
  assert.equal(after.tasks.length, 2); assert.deepEqual(after.tasks[0], before.tasks[0]);
  assert.equal(after.tasks[1].plannedDate, "2026-11-01"); assert.equal(after.tasks[1].startTime, "23:50");
  assert.equal(after.tasks[1].endDate, "2026-11-02"); assert.equal(after.tasks[1].endTime, "00:20");
  assert.equal(after.tasks[1].minutes, 30); assert.equal(after.tasks[1].bufferMinutes, 5); assert.equal(after.tasks[1].notes, "New notes");
  assert.deepEqual(after.goalTree, before.goalTree); assert.equal(JSON.stringify(before), raw); assert.equal(validPlan(after), true);
});

test("new timetable task previews overlaps and carries selected category and tags", () => {
  const before = plan({ categories: [{ id: "work", name: "Work", color: "#123456" }], tags: [{ id: "study", name: "Study" }] });
  const preview = previewNewTimetableTask(before, newDraft({ date: "2026-10-26", time: "09:15", categoryId: "work", tagIds: ["study"] }));
  assert.ok(preview.warnings.some(warning => warning.includes("시간 겹침")));
  assert.equal(preview.task.categoryId, "work"); assert.deepEqual(preview.task.tagIds, ["study"]);
  assert.equal(before.tasks.length, 1);
});

test("new task rejects duplicate, partial, oversized, stale and forged additions atomically", () => {
  const before = plan(), raw = JSON.stringify(before);
  for (const patch of [{ title: " " }, { title: "x".repeat(121) }, { id: "a" }, { time: "24:00" }, { date: "invalid" }, { work: "", buffer: "5" }, { work: "240", buffer: "1" }, { notes: "x".repeat(2001) }, { tagIds: ["missing"] }, { title: "a", date: "2026-10-26", time: "09:00" }]) assert.throws(() => previewNewTimetableTask(before, newDraft(patch)));
  const preview = previewNewTimetableTask(before, newDraft());
  assert.throws(() => applyNewTimetableTask({ ...before, start: "08:00" }, preview));
  assert.throws(() => applyNewTimetableTask(before, { ...preview, next: { ...preview.next, start: "08:00" } }));
  assert.throws(() => applyNewTimetableTask(applyNewTimetableTask(before, preview), preview));
  assert.equal(JSON.stringify(before), raw);
});

test("two dimensional drag resolves day columns, five minute steps, boundaries and invalid inputs", () => {
  assert.deepEqual(timetableDragOffset(540, 32, "2026-10-31", "2026-11-01"), { minutes: 30, days: 1 });
  assert.deepEqual(timetableDragOffset(540, -13, "2026-10-26", "2026-10-25"), { minutes: -15, days: -1 });
  assert.deepEqual(timetableDragOffset(3, -90), { minutes: -3, days: 0 });
  assert.deepEqual(timetableDragOffset(1438, 0, "2026-10-31", "2026-11-01"), { minutes: 0, days: 1 });
  assert.deepEqual(timetableDragOffset(1438, 60), { minutes: 1, days: 0 });
  assert.throws(() => timetableDragOffset(540, Infinity));
  assert.throws(() => timetableDragOffset(540, 15, "invalid", "2026-11-01"));
});

test("dropping into another day across a month preserves task content, duration and goal links", () => {
  const before = plan({ tasks: [task("a", { plannedDate: "2026-10-31", endDate: "2026-10-31" })] });
  const delta = timetableDragOffset(540, 30, "2026-10-31", "2026-11-01");
  const target = shiftStart(before.tasks[0].plannedDate, before.tasks[0].startTime, delta.minutes + delta.days * 1440);
  const after = applyTimeMove(before, previewTimeMove(before, "a", target.date, target.time));
  assert.equal(after.tasks[0].plannedDate, "2026-11-01"); assert.equal(after.tasks[0].startTime, "09:30");
  assert.equal(after.tasks[0].endTime, "10:30"); assert.equal(after.tasks[0].notes, "Keep memo");
  assert.equal(after.tasks[0].minutes, 60); assert.equal(after.tasks[0].bufferMinutes, 10); assert.deepEqual(after.goalTree, before.goalTree);
});
