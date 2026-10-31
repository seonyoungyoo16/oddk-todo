import test from "node:test";
import assert from "node:assert/strict";
import { previewBulkAction, applyBulkAction } from "../../app/todo/bulk-actions.ts";
import { makeUndo, applyUndo } from "../../app/todo/plan-history.ts";
import { validWorkspace, emptyWorkspace } from "../../app/todo/workspace-draft.ts";
import { saveDraft, decodeDraft, draftKey } from "../../app/todo/draft-store.ts";
const task = (id, patch = {}) => ({ id, title: id, notes: "", minutes: 60, bufferMinutes: 10, startTime: "09:00", endTime: "10:00", endDate: "2026-10-28", endDayOffset: 0, plannedDate: "2026-10-28", priority: "normal", done: false, ...patch });
const plan = () => ({ schemaVersion: 4, start: "09:00", tasks: [task("a"), task("b", { plannedDate: "2026-10-29", endDate: "2026-10-29" }), task("c")], reviewsByDate: {}, mandala: { goal: "Preserve", areas: Array.from({ length: 8 }, (_, i) => ({ title: String(i), taskIds: [i === 0 ? "a" : i === 1 ? "b" : "", ...Array(7).fill("")] })) } });
test("bulk preview excludes off-screen selections; cancel and undo preserve the plan", () => {
  const before = plan(), snapshot = structuredClone(before);
  const request = previewBulkAction(before, ["a", "b", "gone"], ["a", "c"], "done");
  assert.equal("hidden" in request, false); assert.deepEqual(request.tasks.map(t => t.id), ["a"]); assert.deepEqual(before, snapshot);
  const next = applyBulkAction(before, request);
  assert.deepEqual(next.tasks.map(t => t.done), [true, false, false]);
  assert.deepEqual(next.tasks.map(task => ({ ...task, done: false })), before.tasks.map(task => ({ ...task, done: false })));
  assert.deepEqual(applyUndo(next, makeUndo(before, next, "Bulk complete")), before);
  assert.throws(() => previewBulkAction(before, ["gone"], [], "delete"));
  assert.throws(() => previewBulkAction(before, ["a", "b"], [], "delete"));
});
test("bulk delete restores only selected tasks and goal references on undo", () => {
  const before = plan(), next = applyBulkAction(before, previewBulkAction(before, ["a", "b"], ["a", "b"], "delete"));
  assert.deepEqual(next.tasks.map(t => t.id), ["c"]); assert.equal(next.mandala.areas[0].taskIds[0], ""); assert.equal(next.mandala.areas[1].taskIds[0], "");
  assert.deepEqual(applyUndo(next, makeUndo(before, next, "Bulk delete")), before);
});
test("changed remote plan, forged targets and duplicate reactivation cannot change data", () => {
  const before = plan(), request = previewBulkAction(before, ["a", "b"], ["a"], "delete");
  assert.throws(() => applyBulkAction({ ...before, tasks: before.tasks.map(t => t.id === "a" ? { ...t, notes: "Remote update" } : t) }, request), /계획이 바뀌/);
  assert.throws(() => applyBulkAction(before, { ...request, tasks: [task("forged")] }));
  const duplicate = { ...before, tasks: [task("a", { title: "Same", done: true }), task("b", { title: "same" })] };
  assert.throws(() => applyBulkAction(duplicate, previewBulkAction(duplicate, ["a"], ["a"], "undone")), /같은 내용/);
});
test("selection, sort and incomplete deadline draft survive reload without crossing accounts", () => {
  const map = new Map(), storage = { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) };
  const workspace = { ...emptyWorkspace, selectedIds: ["a", "b"], selectionMode: true, sort: "deadline", editors: { a: { base: task("a"), baseMandala: plan().mandala, title: "a", work: "50", buffer: "10", start: "09:00", date: "2026-10-28", priority: "normal", done: false, links: [], importance: "high", dueDate: "", dueTime: "10:00" } } };
  assert.equal(validWorkspace(workspace), true);
  assert.equal(validWorkspace({ ...workspace, view: "dashboard" }), true);
  assert.equal(validWorkspace({ ...workspace, view: "settings" }), true);
  saveDraft(storage, "local", "workspace", workspace, validWorkspace);
  assert.deepEqual(decodeDraft(storage.getItem(draftKey("local", "workspace")), validWorkspace).data, workspace);
  assert.equal(storage.getItem(draftKey("other", "workspace")), null);
  assert.equal(validWorkspace({ ...workspace, selectedIds: ["a", "a"] }), false);
  assert.equal(validWorkspace({ ...workspace, sort: "unexpected" }), false);
  assert.equal(validWorkspace({ ...workspace, selectionMode: "yes" }), false);
});
