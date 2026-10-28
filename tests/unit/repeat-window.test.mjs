import test from "node:test";
import assert from "node:assert/strict";
import { prepareRepeatWindow } from "../../supabase/functions/_shared/repeat-window.ts";
import { createRecurrence, editRepeatOccurrence, stopRecurrence } from "../../supabase/functions/_shared/repeat-actions.ts";
const task = { id: "a", title: "Routine", notes: "", priority: "normal", done: false, plannedDate: "2026-10-28", minutes: null, bufferMinutes: null, startTime: null, endTime: null, endDate: null, endDayOffset: null };
const p = () => createRecurrence({ schemaVersion: 5, tasks: [task], start: "09:00", reviewsByDate: {}, goalTree: { goal: "G", groups: [] } }, "a", "series", { frequency: "daily", startDate: "2026-10-28", untilDate: null, interval: 1 }, { from: "2026-10-28", through: "2026-10-28" });

test("rolling window extends once on a new Korean date and never duplicates prepared dates", () => {
  const source = p(), raw = JSON.stringify(source), first = prepareRepeatWindow(source, "2026-10-28");
  assert.equal(first.tasks.length, 31); assert.equal(JSON.stringify(source), raw);
  assert.equal(prepareRepeatWindow(first, "2026-10-28"), first);
  const nextDay = prepareRepeatWindow(first, "2026-10-29"); assert.equal(nextDay.tasks.length, 32);
  assert.equal(nextDay.tasks.at(-1).repeatDate, "2026-11-28");
});
test("a distant calendar range appends only missing occurrences while completed, moved and skipped records remain intact", () => {
  let first = prepareRepeatWindow(p(), "2026-10-28");
  first = { ...first, tasks: first.tasks.map(t => t.id === "a" ? { ...t, done: true } : t) };
  const one = first.tasks[1]; first = editRepeatOccurrence(first, { ...one, plannedDate: "2027-01-01" });
  first = stopRecurrence(first, "series", "2026-10-30", "this");
  const next = prepareRepeatWindow(first, "2026-10-28", { from: "2027-02-01", through: "2027-02-07" });
  assert.equal(next.tasks.length, 37); assert.deepEqual(next.tasks.find(t => t.id === one.id), first.tasks.find(t => t.id === one.id));
  assert.deepEqual(next.tasks[0], first.tasks[0]); assert.equal(next.tasks.some(t => t.repeatDate === "2026-10-30"), false);
  assert.equal(next.tasks.filter(t => t.repeatDate.startsWith("2027-02")).length, 7);
});
test("invalid or unbounded visible ranges reject atomically and calendar upper bounds stay finite", () => {
  const source = p(), raw = JSON.stringify(source);
  assert.throws(() => prepareRepeatWindow(source, "bad"));
  assert.throws(() => prepareRepeatWindow(source, "2026-10-28", { from: "2026-10-29T00:00", through: "2026-10-30" }), /유효한 날짜/);
  assert.throws(() => prepareRepeatWindow(source, "2026-10-28", { from: "2027-01-01", through: "2028-01-03" }), /366/);
  assert.equal(JSON.stringify(source), raw);
  const future = prepareRepeatWindow(source, "9999-12-30"); assert.equal(future.tasks.filter(t => t.repeatDate.startsWith("9999")).length, 2);
});
