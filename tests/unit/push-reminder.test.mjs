import test from "node:test";
import assert from "node:assert/strict";
import { reminderWindow, currentReminder } from "../../supabase/functions/_shared/push-reminder.ts";
const task = (patch = {}) => ({ id: "a", title: "Private current title", notes: "Not in a push payload", done: false, priority: "normal", plannedDate: "2026-10-29", minutes: 60, bufferMinutes: 10, startTime: "00:00", endTime: "01:00", endDate: "2026-10-29", endDayOffset: 0, reminderMinutes: 0, ...patch });
const plan = t => ({ schemaVersion: 6, start: "09:00", tasks: [t], reviewsByDate: {}, goalTree: { goal: "G", groups: [] } });
test("Korean midnight and lead zero become exact UTC instants with a bounded delivery grace", () => {
  assert.deepEqual(reminderWindow(task()), { startAt: "2026-10-28T15:00:00.000Z", dueAt: "2026-10-28T15:00:00.000Z", expiresAt: "2026-10-28T15:02:00.000Z" });
  assert.deepEqual(reminderWindow(task({ reminderMinutes: 60 })), { startAt: "2026-10-28T15:00:00.000Z", dueAt: "2026-10-28T14:00:00.000Z", expiresAt: "2026-10-28T14:05:00.000Z" });
  assert.equal(reminderWindow(task({ reminderMinutes: 5 })).expiresAt, "2026-10-28T15:00:00.000Z");
});
test("completed/summary/disabled/undated or invalid schedules never produce a reminder", () => {
  for (const patch of [{ done: true }, { summaryOnly: true }, { reminderMinutes: null }, { reminderMinutes: undefined }, { reminderMinutes: -1 }, { reminderMinutes: 2 }, { plannedDate: null }, { plannedDate: "2026-02-30" }, { startTime: null }, { startTime: "24:00" }, { minutes: null }, { minutes: 241 }]) assert.equal(reminderWindow(task(patch)), null);
});
test("the latest task must match the queued window; title-only edits return only the current task", () => {
  const t = task(), window = reminderWindow(t), at = new Date(window.dueAt);
  assert.deepEqual(currentReminder(plan(t), t.id, window, at), t);
  const renamed = task({ title: "Updated after enqueue" }); assert.equal(currentReminder(plan(renamed), t.id, window, at).title, renamed.title);
  for (const patch of [{ done: true }, { summaryOnly: true }, { reminderMinutes: 10 }, { startTime: "00:10", endTime: "01:10" }, { plannedDate: "2026-10-30", endDate: "2026-10-30" }]) assert.equal(currentReminder(plan(task(patch)), t.id, window, at), null);
  assert.equal(currentReminder({ ...plan(t), tasks: [] }, t.id, window, at), null);
});
test("not due, expiry boundary, tampered timestamps, older schemas and malformed plans fail closed", () => {
  const t = task(), window = reminderWindow(t), at = new Date(window.dueAt);
  assert.equal(currentReminder(plan(t), t.id, window, new Date(at.getTime() - 1)), null);
  assert.equal(currentReminder(plan(t), t.id, window, new Date(window.expiresAt)), null);
  assert.equal(currentReminder(plan(t), t.id, { ...window, expiresAt: new Date(at.getTime() + 500000).toISOString() }, at), null);
  assert.equal(currentReminder(plan(t), t.id, window, new Date("bad")), null);
  assert.equal(currentReminder({ ...plan(t), schemaVersion: 5 }, t.id, window, at), null);
  assert.equal(currentReminder({ ...plan(t), tasks: [...plan(t).tasks, t] }, t.id, window, at), null);
  assert.equal(currentReminder({ schemaVersion: 7 }, t.id, window, at), null);
});
