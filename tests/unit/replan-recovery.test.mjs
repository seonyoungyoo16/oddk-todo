import test from "node:test";
import assert from "node:assert/strict";
import { loadPlan } from "../../supabase/functions/_shared/plan-migration.ts";
import { previewReplan } from "../../supabase/functions/_shared/replan.ts";
import { makeReplanRecovery, restoreReplanRecovery, validReplanRecovery } from "../../app/todo/replan-recovery.ts";
const date = "2026-10-29";
function preview() {
  const loaded = loadPlan(JSON.stringify({ schemaVersion: 2, start: "09:00", reviewsByDate: {}, tasks: [{ id: "one", title: "Synthetic", notes: "Long private note".repeat(100), plannedDate: date, startTime: "08:00", minutes: 30, bufferMinutes: 5, priority: "normal", done: false }] }));
  assert.equal(loaded.ok, true);
  return previewReplan({ ...loaded.plan, availabilityByDate: { [date]: { start: "09:00", end: "18:00", fixed: [] } } }, { date, baseMinute: 600, pinnedIds: [] });
}
test("compact recovery preserves exact timing/presence without duplicating private notes", async () => {
  const p = preview(), recovery = await makeReplanRecovery(p);
  assert.equal(validReplanRecovery(recovery), true); assert.equal(JSON.stringify(recovery).includes("Long private note"), false);
  assert.deepEqual(await restoreReplanRecovery(p.after, recovery), p.expected);
  assert.deepEqual(await restoreReplanRecovery(p.expected, recovery), p.expected);
});
test("recovery refuses changed title, completion, date, actual timing or deleted task atomically", async () => {
  const p = preview(), recovery = await makeReplanRecovery(p);
  for (const patch of [{ title: "New" }, { done: true }, { plannedDate: "2026-10-30" }, { startTime: "11:00" }]) {
    const current = { ...p.after, tasks: [{ ...p.after.tasks[0], ...patch }] }, before = JSON.stringify(current);
    await assert.rejects(restoreReplanRecovery(current, recovery)); assert.equal(JSON.stringify(current), before);
  }
  await assert.rejects(restoreReplanRecovery({ ...p.after, tasks: [] }, recovery));
});
test("recovery ignores transport key order and keeps unrelated new tasks and root edits", async () => {
  const p = preview(), recovery = await makeReplanRecovery(p);
  const task = Object.fromEntries(Object.entries(p.after.tasks[0]).reverse());
  const other = { ...task, id: "other", title: "Other", plannedDate: null, startTime: null, endTime: null, endDate: null, endDayOffset: null };
  const current = { ...p.after, review: "New review", tasks: [task, other] };
  const result = await restoreReplanRecovery(current, recovery);
  assert.deepEqual(result.tasks[0], p.expected.tasks[0]); assert.deepEqual(result.tasks[1], other); assert.equal(result.review, "New review");
});
test("malformed or injected recovery cannot introduce arbitrary task fields", async () => {
  const p = preview(), recovery = await makeReplanRecovery(p);
  const forged = structuredClone(recovery); forged.changes[0].before.title = "Injected";
  assert.equal(validReplanRecovery(forged), false); await assert.rejects(restoreReplanRecovery(p.after, forged));
  const duplicate = { ...recovery, changes: [...recovery.changes, ...recovery.changes] }; assert.equal(validReplanRecovery(duplicate), false);
});
