import test from "node:test";
import assert from "node:assert/strict";
import { addTaskCandidates, parseTaskCandidates } from "../../app/todo/batch-tasks.ts";
const plan = () => ({ schemaVersion: 5, start: "09:00", tasks: [], reviewsByDate: {}, goalTree: { goal: "Preserve", groups: [] } });
const context = { date: "2026-10-30", categoryId: null, tagIds: [] };
const ids = () => { let index = 0; return () => `batch-${index++}`; };
test("AI candidates must be a nonempty bounded list of editable titles", () => {
  assert.deepEqual(parseTaskCandidates({ titles: [" 운동하기 ", "장보기", "메일 보내기"] }), ["운동하기", "장보기", "메일 보내기"]);
  for (const value of [null, "text", { titles: [] }, { titles: [""] }, { titles: ["x".repeat(121)] }, { titles: Array(33).fill("x") }, { titles: [42] }]) assert.throws(() => parseTaskCandidates(value));
});
test("confirmed candidates are added atomically as distinct untimed tasks without changing source plan or goals", () => {
  const before = plan(), original = structuredClone(before);
  const next = addTaskCandidates(before, ["운동하기", "장보기", "메일 보내기"], context, ids());
  assert.deepEqual(before, original); assert.deepEqual(next.goalTree, before.goalTree);
  assert.deepEqual(next.tasks.map(task => task.title), ["운동하기", "장보기", "메일 보내기"]);
  assert.equal(new Set(next.tasks.map(task => task.id)).size, 3);
  assert.ok(next.tasks.every(task => task.plannedDate === context.date && task.startTime === null && task.minutes === null && task.done === false));
});
test("duplicate candidates, existing tasks, invalid taxonomy and ID conflicts never partially append", () => {
  const before = addTaskCandidates(plan(), ["운동하기"], context, () => "existing"), original = structuredClone(before);
  for (const [titles, settings, createId] of [
    [["장보기", "장보기"], context, ids()],
    [["장보기", "운동하기"], context, ids()],
    [["장보기"], { ...context, date: "bad" }, ids()],
    [["장보기"], { ...context, tagIds: ["missing"] }, ids()],
    [["장보기"], context, () => "existing"],
  ]) assert.throws(() => addTaskCandidates(before, titles, settings, createId));
  assert.deepEqual(before, original);
});
test("same titles on another date and previously completed tasks are independent additions", () => {
  const before = addTaskCandidates(plan(), ["운동하기"], context, () => "existing");
  assert.equal(addTaskCandidates(before, ["운동하기"], { ...context, date: "2026-10-31" }, ids()).tasks.length, 2);
  const completed = { ...before, tasks: before.tasks.map(task => ({ ...task, done: true })) };
  assert.equal(addTaskCandidates(completed, ["운동하기"], context, ids()).tasks.length, 2);
});
