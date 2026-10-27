import test from "node:test";
import assert from "node:assert/strict";
import { rescheduleTask, saveDatedReview, moveLegacyReview, editReviewDraft, hasReviewConflict } from "../../app/todo/planning-actions.ts";
import { validPlan } from "../../supabase/functions/_shared/plan.ts";
const plan = () => ({ schemaVersion: 2, start: "09:00", tasks: [{ id: "same-id", title: "Synthetic", plannedDate: "2026-10-26", minutes: 60, bufferMinutes: 10, startTime: "23:30", done: false, priority: "high" }], mandala: { goal: "Goal", areas: Array.from({ length: 8 }, (_, i) => ({ title: "", taskIds: [i === 0 ? "same-id" : "", ...Array(7).fill("")] })) }, review: "Undated original", reviewsByDate: { "2026-10-26": "Yesterday" } });
test("rescheduling only changes date and clears start; IDs/time/goal references remain", () => {
  const old = plan(); const next = rescheduleTask(old, "same-id", "2026-10-28", "2026-10-27");
  assert.equal(validPlan(old), true); assert.equal(validPlan(next), true);
  assert.equal(next.tasks.length, 1);
  assert.deepEqual(next.tasks[0], { ...old.tasks[0], plannedDate: "2026-10-28", startTime: null });
  assert.equal(next.mandala, old.mandala); assert.equal(next.reviewsByDate, old.reviewsByDate);
  assert.equal(old.tasks[0].plannedDate, "2026-10-26");
  assert.throws(() => rescheduleTask({ ...old, tasks: [{ ...old.tasks[0], done: true }] }, "same-id", "2026-10-28", "2026-10-27"));
  assert.throws(() => rescheduleTask(old, "same-id", "2026-02-30", "2026-10-27"));
  assert.throws(() => rescheduleTask(old, "same-id", "2026-10-26", "2026-10-27"));
});
test("dated reviews are independent and legacy moves require an empty explicit target", () => {
  const old = plan(); const next = saveDatedReview(old, "2026-10-27", "Today", "");
  assert.equal(next.reviewsByDate["2026-10-26"], "Yesterday");
  assert.equal(next.reviewsByDate["2026-10-27"], "Today"); assert.equal(next.review, old.review);
  assert.throws(() => saveDatedReview(next, "2026-10-27", "Stale", ""));
  assert.throws(() => moveLegacyReview(next, "2026-10-27", old.review));
  const moved = moveLegacyReview(next, "2026-10-28", old.review);
  assert.equal(moved.review, ""); assert.equal(moved.reviewsByDate["2026-10-28"], old.review);
  assert.equal(moved.reviewsByDate["2026-10-27"], "Today"); assert.equal(old.review, "Undated original");
});
test("an external review update cannot silently replace a local draft", () => {
  const draft = editReviewDraft(undefined, "Original", "My draft");
  assert.equal(hasReviewConflict(draft, "Original"), false);
  assert.equal(hasReviewConflict(draft, "Other device"), true);
  const continued = editReviewDraft(draft, "Other device", "My continued draft");
  assert.equal(continued.base, "Original"); assert.equal(continued.text, "My continued draft");
  assert.equal(hasReviewConflict(continued, "Other device"), true);
  assert.equal(hasReviewConflict(editReviewDraft({ text: "Other device", base: "Original" }, "Other device", "New edit"), "Other device"), false);
});
