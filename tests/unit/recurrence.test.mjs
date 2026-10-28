import test from "node:test";
import assert from "node:assert/strict";
import { validPlan } from "../../supabase/functions/_shared/plan.ts";
import { loadPlan, preserveV6Backup } from "../../supabase/functions/_shared/plan-migration.ts";
import { repeatTemplateFrom, validRepeatTemplate, seriesOccurrenceId } from "../../supabase/functions/_shared/recurrence.ts";
import { createRecurrence, materializeRecurrences, editRepeatOccurrence, updateRecurrence, stopRecurrence, removeRepeatTasks, detachRepeatOccurrence, preserveManualRepeatEdits } from "../../supabase/functions/_shared/repeat-actions.ts";
import { makeUndo, applyUndo } from "../../app/todo/plan-history.ts";
import { deletePlanTasks, saveGoalTree, splitTask } from "../../app/todo/goal-actions.ts";
import { removeCategory, removeTag } from "../../app/todo/classification-actions.ts";
import { previewTimeMove, applyTimeMove } from "../../app/todo/task-movement.ts";
import { rescheduleTask } from "../../app/todo/planning-actions.ts";
const from = "2026-10-28", range = { from, through: "2026-11-04" };
const rule = (patch = {}) => ({ frequency: "daily", startDate: from, untilDate: null, interval: 1, ...patch });
const task = (patch = {}) => ({ id: "source", title: "Routine", notes: "Preserve", plannedDate: from, startTime: "23:30", minutes: 60, bufferMinutes: 10, endTime: "00:30", endDate: "2026-10-29", endDayOffset: 1, priority: "high", importance: "low", dueDate: "2026-10-29", dueTime: "12:00", categoryId: "work", tagIds: ["tag"], done: false, ...patch });
const plan = () => ({ schemaVersion: 5, start: "09:00", tasks: [task()], reviewsByDate: { [from]: "Review" }, goalTree: { goal: "G", groups: [{ id: "g", title: "Goal", taskIds: ["source"] }] }, categories: [{ id: "work", name: "Work", color: "#123456" }], tags: [{ id: "tag", name: "tag" }], extension: { preserve: true } });
const recurring = () => createRecurrence(plan(), "source", "series", rule(), range);
const at = (p, date) => p.tasks.find(t => t.repeatDate === date);

test("V6 opt-in preserves ordinary V5 reads, every original field and stable occurrence identities", () => {
  const before = plan(), raw = JSON.stringify(before), next = recurring();
  assert.equal(loadPlan(raw).plan.schemaVersion, 5); assert.equal(next.schemaVersion, 6); assert.equal(validPlan(next), true);
  for (const key of ["start", "reviewsByDate", "categories", "tags", "extension"]) assert.deepEqual(next[key], before[key]);
  assert.deepEqual(at(next, from), { ...before.tasks[0], repeatSeriesId: "series", repeatDate: from });
  assert.equal(at(next, "2026-10-29").id, "repeat:series:2026-10-29");
  assert.equal(at(next, "2026-10-29").endDate, "2026-10-30"); assert.equal(at(next, "2026-10-29").dueDate, "2026-10-30");
  assert.equal(at(next, "2026-10-29").minutes, 60); assert.equal(at(next, "2026-10-29").bufferMinutes, 10);
  assert.equal(next.goalTree.groups[0].taskIds.length, 8);
  assert.deepEqual(materializeRecurrences(next, range), next); assert.deepEqual(loadPlan(JSON.stringify(next)).plan, next);
  assert.equal(JSON.stringify(before), raw); assert.equal(loadPlan(JSON.stringify({ ...next, schemaVersion: 7 })).ok, false);
});
test("templates validate reminders, relative deadlines, unknown data and nested array independence", () => {
  const template = repeatTemplateFrom(task()); assert.equal(template.dueOffsetDays, 1); assert.equal(validRepeatTemplate(template), true);
  for (const patch of [{ dueOffsetDays: 366 }, { dueOffsetDays: null, dueTime: "12:00" }, { dueTime: 123 }, { reminderMinutes: 4 }, { startTime: null, minutes: null, bufferMinutes: null, reminderMinutes: 0 }, { mystery: true }]) assert.equal(validRepeatTemplate({ ...template, ...patch }), false);
  const before = recurring(), second = at(before, "2026-10-29"); second.tagIds.push("local-mutation");
  assert.deepEqual(before.recurrences[0].segments[0].template.tagIds, ["tag"]);
  assert.deepEqual(at(before, "2026-10-30").tagIds, ["tag"]);
});
test("V6 rejects malformed series, dangling refs, forged identities and recurrence semantics on older formats", () => {
  const p = recurring(), s = p.recurrences[0];
  for (const recurrences of [[{ ...s, skippedDates: [from] }], [s, s], [{ ...s, segments: [...s.segments, s.segments[0]] }], [{ ...s, goalGroupIds: ["missing"] }], [{ ...s, segments: [{ ...s.segments[0], template: { ...s.segments[0].template, parentTaskId: "missing" } }] }]]) assert.equal(validPlan({ ...p, recurrences }), false);
  for (const patch of [{ repeatSeriesId: "missing" }, { repeatDate: "2026-02-30" }, { id: "forged" }, { repeatException: "yes" }, { reminderMinutes: -1 }, { summaryOnly: true }]) assert.equal(validPlan({ ...p, tasks: p.tasks.map((t, i) => i ? t : { ...t, ...patch }) }), false);
  assert.equal(validPlan({ ...p, recurrences: undefined }), false);
  assert.equal(validPlan({ ...p, schemaVersion: 5 }), false);
  assert.equal(validPlan({ ...plan(), recurrences: [] }), false);
});
test("this occurrence can move dates while retaining its original key, and skipped dates never resurrect", () => {
  const p = recurring(), original = at(p, "2026-10-29");
  const moved = editRepeatOccurrence(p, { ...original, plannedDate: "2026-11-10", endDate: "2026-11-11", title: "Just this one" });
  assert.equal(at(moved, "2026-10-29").id, original.id); assert.equal(at(moved, "2026-10-29").repeatException, true);
  assert.deepEqual(materializeRecurrences(moved, range), moved);
  const skipped = stopRecurrence(moved, "series", "2026-10-30", "this");
  assert.equal(at(materializeRecurrences(skipped, range), "2026-10-30"), undefined);
  const unmaterialized = stopRecurrence(skipped, "series", "2026-11-20", "this");
  assert.equal(at(materializeRecurrences(unmaterialized, { from: "2026-11-20", through: "2026-11-20" }), "2026-11-20"), undefined);
  assert.equal(at(skipped, "2026-10-29").plannedDate, "2026-11-10");
});
test("future changes preserve earlier tasks, completed history and individual exceptions while updating only regular future occurrences", () => {
  let p = recurring();
  p = { ...p, tasks: p.tasks.map(t => t.repeatDate === "2026-10-30" ? { ...t, done: true } : t) };
  p = editRepeatOccurrence(p, { ...at(p, "2026-10-31"), title: "Individual exception" });
  const template = { ...p.recurrences[0].segments[0].template, title: "Changed future" };
  const next = updateRecurrence(p, "series", "2026-10-29", "future", rule({ startDate: "2026-10-29", interval: 2 }), template, range);
  assert.deepEqual(at(next, from), at(p, from)); assert.deepEqual(at(next, "2026-10-30"), at(p, "2026-10-30"));
  assert.deepEqual(at(next, "2026-10-31"), at(p, "2026-10-31"));
  assert.equal(at(next, "2026-10-29").title, "Changed future"); assert.equal(at(next, "2026-11-01"), undefined);
  assert.equal(at(next, "2026-11-02").title, "Changed future");
  assert.equal(next.recurrences[0].segments.length, 2); assert.equal(validPlan(next), true);
});
test("all changes keep completed and individual history, and future/all stops cancel the requested unfinished range", () => {
  let p = recurring(); p = { ...p, tasks: p.tasks.map(t => t.repeatDate === "2026-10-29" ? { ...t, done: true } : t) };
  p = editRepeatOccurrence(p, { ...at(p, "2026-10-30"), title: "Exception" });
  const all = updateRecurrence(p, "series", "2026-10-30", "all", rule({ interval: 2 }), { ...p.recurrences[0].segments[0].template, title: "All regular" }, range);
  assert.equal(at(all, from).title, "All regular"); assert.deepEqual(at(all, "2026-10-29"), at(p, "2026-10-29")); assert.equal(at(all, "2026-10-30").title, "Exception");
  const futureStop = stopRecurrence(all, "series", "2026-10-30", "future");
  assert.equal(at(futureStop, "2026-10-30"), undefined); assert.equal(at(futureStop, from).title, "All regular");
  assert.deepEqual(materializeRecurrences(futureStop, range), futureStop);
  const stopped = stopRecurrence(all, "series", from, "all");
  assert.deepEqual(stopped.tasks, [at(p, "2026-10-29")]); assert.deepEqual(materializeRecurrences(stopped, range), stopped);
  assert.deepEqual(stopRecurrence(p, "series", "2026-10-29", "this"), p);
});
test("deletion and scope edits undo atomically without resurrecting skipped dates or losing original goals", () => {
  const original = plan(), created = recurring(), undo = makeUndo(original, created, "Repeat");
  const restored = applyUndo(created, undo); assert.deepEqual(restored, { ...original, schemaVersion: 6 });
  const deleted = removeRepeatTasks(created, new Set([at(created, "2026-10-29").id]));
  assert.deepEqual(applyUndo(deleted, makeUndo(created, deleted, "Skip")), created);
  const changed = updateRecurrence(created, "series", "2026-10-30", "future", rule({ startDate: "2026-10-30", interval: 2 }), { ...created.recurrences[0].segments[0].template, title: "New" }, range);
  assert.deepEqual(applyUndo(changed, makeUndo(created, changed, "Future")), created);
});
test("ID/title collisions, invalid ranges and task limits fail atomically without partial generation", () => {
  const p = plan(), raw = JSON.stringify(p);
  const collision = { ...p, tasks: [...p.tasks, task({ id: "repeat:series:2026-10-29", title: "Other" })] };
  assert.throws(() => createRecurrence(collision, "source", "series", rule(), range), /ID/);
  const titleCollision = { ...p, tasks: [...p.tasks, task({ id: "other", plannedDate: "2026-10-29", endDate: "2026-10-30" })] };
  assert.throws(() => createRecurrence(titleCollision, "source", "series", rule(), range), /같은 날짜/);
  assert.throws(() => createRecurrence(p, "source", "series", rule(), { from, through: "2028-01-01" }), /366/);
  const full = { ...p, tasks: [...p.tasks, ...Array.from({ length: 4998 }, (_, i) => task({ id: "item-" + i, title: "Item " + i }))] };
  assert.equal(validPlan(full), true); assert.throws(() => createRecurrence(full, "source", "series", rule(), range), /5000/);
  assert.equal(full.tasks.length, 4999); assert.equal(JSON.stringify(p), raw);
});
test("V6 backup preserves exact prior bytes before a write and never overwrites an earlier backup", () => {
  const raw = JSON.stringify(plan(), null, 2), values = new Map([["plan", raw]]), store = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) };
  preserveV6Backup(store, "plan", raw, plan()); assert.equal(values.has("plan.before-v6"), false);
  preserveV6Backup(store, "plan", raw, recurring()); assert.equal(values.get("plan.before-v6"), raw);
  preserveV6Backup(store, "plan", JSON.stringify(plan()), recurring()); assert.equal(values.get("plan.before-v6"), raw);
  assert.throws(() => preserveV6Backup({ getItem: () => null, setItem: () => { throw Error("quota"); } }, "plan", raw, recurring()), /quota/);
  assert.equal(values.get("plan"), raw); assert.equal(seriesOccurrenceId(recurring().recurrences[0], from), "source");
});

test("existing delete, classification, goal and split operations preserve recurrence references and undo", () => {
  const p = recurring(), id = at(p, "2026-10-29").id;
  const deleted = deletePlanTasks(p, new Set([id])); assert.equal(at(materializeRecurrences(deleted, range), "2026-10-29"), undefined);
  assert.deepEqual(applyUndo(deleted, makeUndo(p, deleted, "Delete")), p);
  const classified = removeTag(removeCategory(p, "work"), "tag"); assert.equal(validPlan(classified), true);
  assert.equal(classified.recurrences[0].segments[0].template.categoryId, null); assert.deepEqual(classified.recurrences[0].segments[0].template.tagIds, []);
  assert.deepEqual(applyUndo(classified, makeUndo(p, classified, "Classification")), p);
  const goals = saveGoalTree(p, { goal: "Goal", groups: [] }); assert.equal(validPlan(goals), true); assert.deepEqual(goals.recurrences[0].goalGroupIds, []);
  const split = splitTask(p, id, [{ id: "child1", title: "Step1" }, { id: "child2", title: "Step2" }], true);
  assert.equal(validPlan(split), true); assert.equal(split.tasks.find(t => t.id === id).summaryOnly, true);
  assert.equal(split.tasks.find(t => t.id === id).repeatSeriesId, undefined);
  assert.deepEqual(materializeRecurrences(split, range), split); assert.deepEqual(applyUndo(split, makeUndo(p, split, "Split")), p);
});
test("single-item edits become exceptions before undo; completion alone does not; UX09 movement and rescheduling preserve stable keys", () => {
  const p = recurring(), one = at(p, from);
  const check = preserveManualRepeatEdits(p, { ...p, tasks: p.tasks.map(t => t.id === one.id ? { ...t, done: true } : t) }); assert.equal(at(check, from).repeatException, undefined);
  const manual = preserveManualRepeatEdits(p, { ...p, tasks: p.tasks.map(t => t.id === one.id ? { ...t, title: "Changed" } : t) }); assert.equal(at(manual, from).repeatException, true);
  assert.deepEqual(applyUndo(manual, makeUndo(p, manual, "Edit")), p);
  const preview = previewTimeMove(p, one.id, "2026-10-29", "11:00"), moved = applyTimeMove(p, preview);
  assert.equal(at(moved, from).repeatException, true); assert.equal(at(moved, from).id, one.id); assert.deepEqual(applyUndo(moved, makeUndo(p, moved, "Time")), p);
  const reminded = { ...p, tasks: p.tasks.map(t => t.id === one.id ? { ...t, reminderMinutes: 10 } : t) };
  const dated = rescheduleTask(reminded, one.id, "2026-11-01", "2026-10-29");
  assert.equal(validPlan(dated), true); assert.equal(at(dated, from).reminderMinutes, null); assert.equal(at(dated, from).repeatException, true);
});
test("detaching one occurrence leaves other dates recurring and can start a separate series without ID collision", () => {
  const p = recurring(), detached = detachRepeatOccurrence(p, "source");
  assert.equal(detached.tasks.find(t => t.id === "source").repeatSeriesId, undefined);
  assert.equal(detached.recurrences[0].skippedDates.includes(from), true);
  assert.deepEqual(materializeRecurrences(detached, range), detached);
  const second = createRecurrence(detached, "source", "another", rule({ interval: 7 }), { from, through: from });
  assert.equal(validPlan(second), true); assert.equal(second.tasks.find(t => t.id === "source").repeatSeriesId, "another");
  assert.deepEqual(applyUndo(second, makeUndo(detached, second, "New repeat")), detached);
});
