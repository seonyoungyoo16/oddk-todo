import test from "node:test";
import assert from "node:assert/strict";
import { dropVisibleTask, shiftStart, previewTimeMove, applyTimeMove } from "../../app/todo/task-movement.ts";
import { moveVisibleTask } from "../../app/todo/task-order.ts";
import { makeUndo, applyUndo } from "../../app/todo/plan-history.ts";
const task = (id, date = "2026-10-28", start = "09:00") => ({ id, title: id, notes: "", done: false, priority: "normal", plannedDate: date, minutes: 60, bufferMinutes: 10, startTime: start, endDate: date, endTime: "10:00", endDayOffset: 0 });
const plan = () => ({ schemaVersion: 5, start: "09:00", reviewsByDate: {}, tasks: [task("a"), task("hidden", "2026-10-29"), task("b")], goalTree: { goal: "G", groups: [{ id: "g", title: "Sub", taskIds: ["a"] }] } });

test("filtered drop and button move preserve hidden slots and all task content; full undo restores order", () => {
  const p = plan(), moved = dropVisibleTask(p, ["a", "b"], "a", "b");
  assert.deepEqual(moved, moveVisibleTask(p, ["a", "b"], "a", 1));
  assert.deepEqual(moved.tasks.map(t => t.id), ["b", "hidden", "a"]);
  assert.equal(moved.tasks[1], p.tasks[1]);
  assert.deepEqual(applyUndo(moved, makeUndo(p, moved, "Move")), p);
  assert.throws(() => dropVisibleTask(p, ["b", "a"], "a", "b"), /순서가 바뀌/);
  assert.throws(() => dropVisibleTask(p, ["a", "b"], "missing", "b"));
});
test("calendar shifts cross month, leap day, year and midnight without timezone assumptions", () => {
  assert.deepEqual(shiftStart("2026-10-28", "00:05", -15), { date: "2026-10-27", time: "23:50" });
  assert.deepEqual(shiftStart("2028-02-28", "23:50", 15), { date: "2028-02-29", time: "00:05" });
  assert.deepEqual(shiftStart("2026-12-31", "23:50", 15), { date: "2027-01-01", time: "00:05" });
  assert.throws(() => shiftStart("0001-01-01", "00:00", -1));
  assert.throws(() => shiftStart("9999-12-31", "23:59", 1));
  assert.throws(() => shiftStart("2026-02-30", "12:00", 15));
  assert.throws(() => shiftStart("2026-10-28", "12:00", 0.5));
});
test("time preview leaves original intact, preserves duration, buffer and goals across midnight, then applies and undoes", () => {
  const p = plan(), raw = JSON.stringify(p), preview = previewTimeMove(p, "a", "2026-10-29", "23:30");
  assert.equal(JSON.stringify(p), raw);
  assert.equal(preview.after.endDate, "2026-10-30"); assert.equal(preview.after.endTime, "00:30");
  assert.equal(preview.after.minutes, 60); assert.equal(preview.after.bufferMinutes, 10);
  const next = applyTimeMove(p, preview);
  assert.deepEqual(next.goalTree, p.goalTree); assert.deepEqual(next.tasks[1], p.tasks[1]);
  assert.deepEqual(applyUndo(next, makeUndo(p, next, "Time")), p);
});
test("all-plan warnings include hidden and fixed overlaps, both dates, and outside activity; adjacency is free", () => {
  const p = plan(); p.tasks[2] = { ...p.tasks[2], startTime: "10:00", endTime: "11:00" };
  p.availabilityByDate = { "2026-10-28": { start: "09:00", end: "18:00", fixed: [{ id: "f", title: "Break", start: "10:30", end: "11:00" }] } };
  const overlap = previewTimeMove(p, "a", "2026-10-28", "10:15");
  assert.ok(overlap.warnings.some(w => w.includes("b")));
  assert.ok(overlap.warnings.some(w => w.includes("Break")));
  assert.deepEqual(previewTimeMove(p, "a", "2026-10-28", "11:00").warnings, []);
  const midnight = previewTimeMove(p, "a", "2026-10-28", "23:30");
  assert.ok(midnight.warnings.some(w => w.includes("2026-10-28") && w.includes("활동 시간 밖")));
  assert.ok(midnight.warnings.some(w => w.includes("2026-10-29") && w.includes("활동 시간 밖")));
});
test("stale, forged, duplicate, completed and invalid moves never overwrite plans", () => {
  const p = plan(), preview = previewTimeMove(p, "a", "2026-10-28", "11:00");
  assert.throws(() => applyTimeMove({ ...p, tasks: [...p.tasks, task("remote")] }, preview), /계획이 바뀌/);
  assert.throws(() => applyTimeMove(p, { ...preview, after: { ...preview.after, minutes: 10 } }), /미리보기/);
  assert.throws(() => applyTimeMove(p, { ...preview, warnings: ["forged"] }), /미리보기/);
  assert.throws(() => previewTimeMove({ ...p, tasks: p.tasks.map(t => t.id === "a" ? { ...t, done: true } : t) }, "a", "2026-10-28", "11:00"));
  assert.throws(() => previewTimeMove(p, "a", "9999-12-31", "23:30"));
  const duplicate = { ...p, tasks: [...p.tasks, { ...task("dup"), title: "a", startTime: "11:00", endTime: "12:00" }] };
  assert.throws(() => previewTimeMove(duplicate, "a", "2026-10-28", "11:00"), /같은 날짜/);
});
