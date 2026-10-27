import test from "node:test";
import assert from "node:assert/strict";
import { makeUndo, applyUndo, validUndo } from "../../app/todo/plan-history.ts";
const task = id => ({ id, title: id, notes: "detail\nsecond line", minutes: 30, bufferMinutes: 5, startTime: "23:50", priority: "high", done: false, plannedDate: "2026-10-28" });
const base = () => ({ schemaVersion: 3, start: "09:00", tasks: [task("a"), task("b")], reviewsByDate: {}, mandala: { goal: "Goal", areas: Array.from({ length: 8 }, (_, i) => ({ title: "Area", taskIds: [i === 0 ? "a" : "", ...Array(7).fill("")] })) } });
test("delete undo restores fields, original order and goal links after serialization", () => {
  const before = base(), after = structuredClone(before); after.tasks.shift(); after.mandala.areas[0].taskIds[0] = "";
  const undo = JSON.parse(JSON.stringify(makeUndo(before, after, "Delete")));
  assert.equal(validUndo(undo), true); assert.deepEqual(applyUndo(after, undo), before);
});
test("bulk completion undo preserves unrelated newer edits and refuses changed affected tasks", () => {
  const before = base(), after = { ...before, tasks: before.tasks.map(t => ({ ...t, done: true })) };
  const undo = makeUndo(before, after, "Complete");
  assert.deepEqual(applyUndo({ ...after, review: "New independent note" }, undo), { ...before, review: "New independent note" });
  const edited = { ...after, tasks: after.tasks.map(t => t.id === "a" ? { ...t, notes: "Newer detail" } : t) };
  assert.throws(() => applyUndo(edited, undo), /이후에 변경/);
});
test("goal link edits after deletion cannot be overwritten by undo", () => {
  const before = base(), after = structuredClone(before); after.tasks.shift(); after.mandala.areas[0].taskIds[0] = "";
  const undo = makeUndo(before, after, "Delete");
  const newer = structuredClone(after); newer.mandala.areas[0].taskIds[0] = "b";
  assert.throws(() => applyUndo(newer, undo), /관련 계획/);
  const withAdded = { ...after, tasks: [...after.tasks, task("c")] };
  assert.deepEqual(applyUndo(withAdded, undo).tasks.map(t => t.id), ["a", "b", "c"]);
});

test("undoing an addition cannot remove an item linked by a newer goal edit", () => {
  const before = base(), after = { ...before, tasks: [...before.tasks, task("c")] };
  const undo = makeUndo(before, after, "Add");
  const newer = structuredClone(after); newer.mandala.areas[1].taskIds[0] = "c";
  assert.throws(() => applyUndo(newer, undo), /목표 연결/);
});
test("undo preserves an absent optional property instead of writing null", () => {
  const before = base(), after = { ...before, review: "Added review" };
  const undo = JSON.parse(JSON.stringify(makeUndo(before, after, "Review")));
  const restored = applyUndo(after, undo);
  assert.equal(Object.hasOwn(restored, "review"), false); assert.deepEqual(restored, before);
});
test("manual order undo refuses later order changes and incomplete titles cannot be duplicated", () => {
  const before = base(), after = { ...before, tasks: [...before.tasks].reverse() };
  const undo = makeUndo(before, after, "Reorder");
  assert.deepEqual(applyUndo(after, undo), before);
  assert.throws(() => applyUndo({ ...after, tasks: [...after.tasks, task("c")] }, undo), /순서/);
  const completed = { ...before, tasks: before.tasks.map(t => ({ ...t, done: true })) };
  assert.throws(() => applyUndo({ ...completed, tasks: [...completed.tasks, { ...task("c"), title: "a" }] }, makeUndo(before, completed, "Complete")), /같은 내용/);
});
test("invalid persisted undo payloads cannot change schema or inject object properties", () => {
  assert.equal(validUndo(null), true); assert.equal(makeUndo(base(), base(), "None"), null);
  for (const key of ["schemaVersion", "tasks", "__proto__", "constructor"]) assert.equal(validUndo({ version: 1, label: "Bad", tasks: [], fields: [{ key, before: null, after: null, beforePresent: false, afterPresent: false }], order: null }), false);
  assert.equal(validUndo({ version: 1, label: "Bad", tasks: [{ id: "a", before: {}, after: null, index: 0 }], fields: [], order: null }), false);
});

test("JSONB object-key order does not create history or reject an unchanged saved task", () => {
  const reorder = value => Array.isArray(value) ? value.map(reorder) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).reverse().map(([k,v]) => [k, reorder(v)])) : value;
  const before = base(), same = reorder(before);
  assert.equal(makeUndo(before, same, "No semantic change"), null);
  const after = { ...before, tasks: before.tasks.map(t => ({ ...t, done: true })) };
  assert.deepEqual(applyUndo(reorder(after), makeUndo(before, after, "Complete")), before);
});
