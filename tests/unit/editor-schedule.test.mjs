import test from "node:test";
import assert from "node:assert/strict";
import { parseEditorSchedule, endpointWindow, retargetEditorDate } from "../../app/todo/editor-schedule.ts";
import { validWorkspace, emptyWorkspace } from "../../app/todo/workspace-draft.ts";
const clock = () => ({ date: "2026-10-28", start: "09:00", end: "10:00", endDate: "2026-10-28", endDay: "0", buffer: "10", work: "", timeMode: "clock" });
test("clock editor derives work and total while empty and partial input remain distinct", () => {
  assert.deepEqual(parseEditorSchedule(clock()), { minutes: 60, bufferMinutes: 10, work: 50, startTime: "09:00", endTime: "10:00", endDate: "2026-10-28", endDayOffset: 0, error: "" });
  const empty = { ...clock(), start: "", end: "", buffer: "" }; assert.equal(parseEditorSchedule(empty).minutes, null); assert.equal(parseEditorSchedule(empty).error, "");
  assert.equal(endpointWindow(empty).ok, false); assert.equal(endpointWindow({ ...clock(), buffer: "" }).ok, true);
  for (const patch of [{ start: "" }, { end: "" }, { buffer: "" }, { buffer: "60" }, { buffer: "1.5" }, { endDate: "" }, { end: "08:00" }]) assert.notEqual(parseEditorSchedule({ ...clock(), ...patch }).error, "");
});
test("legacy partial drafts are preserved, and valid legacy clocks gain explicit endpoints", () => {
  const draft = { work: "25", buffer: "", start: "23:50", date: "2026-10-28" }, original = structuredClone(draft);
  assert.notEqual(parseEditorSchedule(draft).error, ""); assert.deepEqual(draft, original);
  assert.deepEqual(parseEditorSchedule({ ...draft, buffer: "5" }), { minutes: 30, bufferMinutes: 5, startTime: "23:50", endTime: "00:20", endDate: "2026-10-29", endDayOffset: 1, work: 25, error: "" });
  const duration = parseEditorSchedule({ ...draft, buffer: "5", timeMode: "duration" });
  assert.equal(duration.minutes, 30); assert.equal(duration.startTime, null); assert.equal(duration.endTime, null); assert.equal(duration.endDate, null);
});
test("floating clocks require explicit next-day choice and never enter a date implicitly", () => {
  const floating = { ...clock(), date: "", endDate: "", start: "23:50", end: "00:20", endDay: "0", buffer: "5" };
  assert.notEqual(parseEditorSchedule(floating).error, "");
  const next = parseEditorSchedule({ ...floating, endDay: "1" }); assert.equal(next.error, ""); assert.equal(next.minutes, 30); assert.equal(next.endDate, null); assert.equal(next.endDayOffset, 1);
});
test("date changes keep explicit day offset and do not invent a supported year beyond 9999", () => {
  const midnight = { ...clock(), start: "23:50", end: "00:20", endDate: "2026-10-29", endDay: "1", buffer: "5" };
  assert.deepEqual(retargetEditorDate(midnight, "2026-12-31"), { date: "2026-12-31", endDate: "2027-01-01", endDay: "1" });
  assert.deepEqual(retargetEditorDate(midnight, ""), { date: "", endDate: "", endDay: "1" });
  assert.deepEqual(retargetEditorDate(midnight, "9999-12-31"), { date: "9999-12-31", endDate: "", endDay: "1" });
  assert.notEqual(parseEditorSchedule({ ...midnight, ...retargetEditorDate(midnight, "9999-12-31") }).error, "");
});
test("new incomplete endpoint drafts and legacy bases remain durable workspace shapes", () => {
  const goal = { goal: "", areas: Array.from({ length: 8 }, () => ({ title: "", taskIds: Array(8).fill("") })) };
  const base = { id: "a", title: "Original", plannedDate: "2026-10-28", minutes: 60, bufferMinutes: 10, startTime: "09:00", done: false, priority: "normal", notes: "" };
  const editor = { base, baseMandala: goal, title: "Changed", ...clock(), end: "", endDate: "2026-", done: false, priority: "normal", links: [] };
  const workspace = { ...emptyWorkspace, editingId: "a", editors: { a: editor } };
  assert.equal(validWorkspace(workspace), true); assert.deepEqual(JSON.parse(JSON.stringify(workspace)).editors.a, editor);
  assert.equal(validWorkspace({ ...workspace, editors: { a: { ...editor, timeMode: "future-unknown" } } }), false);
});
