import test from "node:test";
import assert from "node:assert/strict";
import { validWorkspace, emptyWorkspace } from "../../app/todo/workspace-draft.ts";
import { initialRepeatDraft, validRepeatDraft, previewRepeatEdit, applyRepeatEdit } from "../../app/todo/repeat-editor-model.ts";
import { createRecurrence, editRepeatOccurrence } from "../../supabase/functions/_shared/repeat-actions.ts";
import { validPlan } from "../../supabase/functions/_shared/plan.ts";
import { makeUndo, applyUndo } from "../../app/todo/plan-history.ts";
const date = "2026-10-28", task = () => ({ id: "a", title: "Routine", notes: "", priority: "normal", done: false, plannedDate: date, minutes: 60, bufferMinutes: 10, startTime: "09:00", endTime: "10:00", endDate: date, endDayOffset: 0 });
const plan = () => ({ schemaVersion: 5, tasks: [task()], start: "09:00", reviewsByDate: {}, goalTree: { goal: "Goal", groups: [{ id: "g", title: "Subgoal", taskIds: ["a"] }] } });
const createDraft = () => ({ ...initialRepeatDraft(task(), plan()), action: "create", seriesId: "series", until: "2026-10-30" });
const recurring = () => createRecurrence(plan(), "a", "series", { frequency: "daily", startDate: date, interval: 1, untilDate: "2026-10-30" }, { from: date, through: "2026-10-30" });

test("partial repeat drafts survive workspace serialization while invalid metadata is rejected", () => {
  const base = task(), p = plan(), draft = { ...createDraft(), interval: "", weekdays: [], until: "" };
  assert.equal(validRepeatDraft(draft), true);
  const editor = { base, baseMandala: { goal: "", areas: Array.from({ length: 8 }, () => ({ title: "", taskIds: Array(8).fill("") })) }, title: base.title, notes: "", work: "50", buffer: "10", start: "09:00", date, priority: "normal", done: false, links: [], repeat: draft, reminder: "0" };
  const workspace = { ...emptyWorkspace, editingId: "a", editors: { a: editor } };
  assert.equal(validWorkspace(JSON.parse(JSON.stringify(workspace))), true);
  assert.throws(() => previewRepeatEdit(p, p, "a", draft, "0", date), /반복 간격/);
  assert.equal(validWorkspace({ ...workspace, editors: { a: { ...editor, repeat: { ...draft, weekdays: [1, 1] } } } }), false);
});
test("repeat preview is immutable and counts actual changes; confirmation applies once and undo preserves original bytes", () => {
  const p = plan(), raw = JSON.stringify(p), preview = previewRepeatEdit(p, p, "a", createDraft(), "", date);
  assert.equal(preview.requiresConfirmation, true); assert.equal(preview.created, 2); assert.equal(preview.changed, 1); assert.equal(preview.removed, 0);
  assert.equal(JSON.stringify(p), raw); assert.equal(preview.next.tasks.length, 3);
  const saved = applyRepeatEdit(p, preview); assert.equal(validPlan(saved), true);
  assert.throws(() => applyRepeatEdit(saved, preview), /계획이 바뀌/);
  assert.deepEqual(applyUndo(saved, makeUndo(p, saved, "Repeat")), { ...p, schemaVersion: 6 });
});
test("zero-minute reminders opt into V6 and clock removal clears their dependency without losing the edit", () => {
  const p = plan(), keep = initialRepeatDraft(task(), p);
  const reminded = previewRepeatEdit(p, p, "a", keep, "0", date);
  assert.equal(reminded.next.schemaVersion, 6); assert.equal(reminded.next.tasks[0].reminderMinutes, 0); assert.equal(reminded.requiresConfirmation, false);
  const before = reminded.next, cleared = { ...before, tasks: before.tasks.map(t => ({ ...t, minutes: null, bufferMinutes: null, startTime: null, endTime: null, endDate: null, endDayOffset: null })) };
  const next = previewRepeatEdit(before, cleared, "a", keep, "0", date).next;
  assert.equal(next.tasks[0].reminderMinutes, null); assert.equal(validPlan(next), true);
  assert.equal(previewRepeatEdit(p, p, "a", keep, "", date).next.schemaVersion, 5);
  assert.throws(() => previewRepeatEdit(p, p, "a", keep, "4", date), /입력/);
});
test("future/all edits use original occurrence dates and protect completed history and other individual exceptions", () => {
  let p = recurring(); p = editRepeatOccurrence(p, { ...p.tasks[2], title: "Individual" });
  p = { ...p, tasks: p.tasks.map(t => t.id === "a" ? { ...t, done: true } : t) };
  const candidate = { ...p, tasks: p.tasks.map(t => t.id === "a" ? { ...t, title: "New template" } : t) };
  const draft = { ...initialRepeatDraft(p.tasks[0], p), action: "update", scope: "all" };
  const preview = previewRepeatEdit(p, candidate, "a", draft, "", date);
  assert.equal(preview.protectedDone, 1); assert.deepEqual(preview.next.tasks[0], p.tasks[0]); assert.equal(preview.next.tasks[1].title, "New template"); assert.equal(preview.next.tasks[2].title, "Individual");
  assert.throws(() => previewRepeatEdit(p, candidate, "a", { ...draft, scope: "this" }, "", date), /범위/);
  assert.throws(() => previewRepeatEdit(p, { ...candidate, tasks: candidate.tasks.map(t => t.id === "a" ? { ...t, plannedDate: "2026-10-29", endDate: "2026-10-29" } : t) }, "a", draft, "", date), /날짜와 완료/);
});
test("stop and detach show different impacts and never silently discard unsaved content edits", () => {
  const p = recurring(), current = p.tasks[0], defaults = { ...p, tasks: p.tasks.map(t => t.id === "a" ? { ...t, importance: "normal", categoryId: null, tagIds: [], dueDate: null, dueTime: null } : t) };
  const stop = { ...initialRepeatDraft(current, p), action: "stop", scope: "future" };
  const preview = previewRepeatEdit(p, defaults, "a", stop, "", date); assert.equal(preview.removed, 3);
  assert.throws(() => previewRepeatEdit(p, { ...p, tasks: p.tasks.map(t => t.id === "a" ? { ...t, title: "Unsaved edit" } : t) }, "a", stop, "", date), /먼저 저장/);
  const detached = previewRepeatEdit(p, p, "a", { ...stop, action: "detach" }, "", date);
  assert.equal(detached.removed, 0); assert.equal(detached.next.tasks[0].repeatSeriesId, undefined); assert.equal(detached.next.tasks[1].repeatSeriesId, "series");
});
test("stale or forged previews and unrelated candidate edits cannot overwrite a current plan", () => {
  const p = plan(), preview = previewRepeatEdit(p, p, "a", createDraft(), "", date);
  assert.throws(() => applyRepeatEdit({ ...p, review: "Remote" }, preview), /계획이 바뀌/);
  assert.throws(() => applyRepeatEdit(p, { ...preview, created: 999 }), /변경안/);
  assert.throws(() => applyRepeatEdit(p, { ...preview, next: { ...preview.next, tasks: [] } }), /변경안/);
  assert.throws(() => previewRepeatEdit(p, { ...p, review: "Unrelated" }, "a", createDraft(), "", date), /입력/);
  assert.throws(() => previewRepeatEdit(p, { ...p, goalTree: { ...p.goalTree, goal: "Unrelated root" } }, "a", createDraft(), "", date), /입력/);
});
