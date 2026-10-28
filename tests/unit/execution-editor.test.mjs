import test from "node:test";
import assert from "node:assert/strict";
import { executionInputTime, initialExecutionEditor, koreanExecutionInput, previewExecutionEditor, validExecutionEditor } from "../../app/todo/execution-editor-model.ts";
import { manualExecution } from "../../supabase/functions/_shared/execution.ts";
const now = "2026-10-29T02:00:00.000Z", task = { id: "one", title: "Synthetic one", done: false, plannedDate: "2026-10-29", minutes: 30, bufferMinutes: 5 };
test("Korean datetime inputs retain exact milliseconds and reject nonexistent dates and rollovers", () => {
  for (const iso of ["2026-10-28T15:00:00.123Z", "2024-02-29T00:00:00.001Z", "0001-01-01T00:00:00.000Z"]) assert.equal(executionInputTime(koreanExecutionInput(iso)), iso);
  assert.equal(executionInputTime("2026-10-29T09:00"), "2026-10-29T00:00:00.000Z");
  for (const bad of ["", "2026-02-30T09:00", "2026-10-29T24:00", "2026-10-29T09:60", "2026-10-29T09:00Z", "2026-10-29", "0000-01-01T00:00"]) assert.throws(() => executionInputTime(bad));
});
test("drafts retain incomplete input, preview preserves snapshot and future/overlap/open intervals cannot be saved", () => {
  const record = manualExecution(task, "00000000-0000-4000-8000-000000000001", [{ kind: "work", start: "2026-10-29T00:00:00.123Z", end: "2026-10-29T00:10:00.456Z" }], now);
  const draft = initialExecutionEditor(record); assert.equal(validExecutionEditor(draft), true); assert.deepEqual(previewExecutionEditor(draft, undefined, now), record);
  const incomplete = { ...draft, rows: [{ kind: "work", start: "2026-10-29T09:00", end: "" }] };
  assert.equal(validExecutionEditor(incomplete), true); assert.throws(() => previewExecutionEditor(incomplete, task, now));
  assert.throws(() => previewExecutionEditor({ ...draft, rows: [{ kind: "work", start: "2026-10-29T09:00", end: "2026-10-29T12:00" }] }, task, now));
  const changed = previewExecutionEditor({ ...draft, rows: [{ kind: "break", start: "2026-10-29T09:00", end: "2026-10-29T09:05" }] }, { ...task, title: "Changed plan" }, now);
  assert.equal(changed.title, record.title); assert.equal(changed.plannedWorkMinutes, 25); assert.equal(changed.segments[0].kind, "break");
  assert.throws(() => previewExecutionEditor(initialExecutionEditor(null), undefined, now));
});
