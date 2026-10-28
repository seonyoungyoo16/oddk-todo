import test from "node:test";
import assert from "node:assert/strict";
import { goalTreeFromMandala, validGoalTree, addGoalGroup, removeGoalGroup, linkGoalTask, unlinkGoalTasks, goalTreeProjection } from "../../supabase/functions/_shared/goal-tree.ts";
const legacy = () => ({ goal: "원문 핵심 목표", areas: Array.from({ length: 8 }, (_, i) => ({ title: i === 0 ? "원문 세부 목표" : "", taskIds: i === 0 ? ["a", "", "a", "missing", "", "", "", ""] : Array(8).fill("") })) });
test("legacy tree conversion preserves text, IDs, blank groups and missing refs without mutating slot archive", () => {
  const original = legacy(), before = JSON.stringify(original), tree = goalTreeFromMandala(original, [{ id: "a" }]);
  assert.equal(JSON.stringify(original), before); assert.equal(tree.goal, original.goal); assert.equal(tree.groups.length, 8);
  assert.deepEqual(tree.groups[0], { id: "legacy-0", title: "원문 세부 목표", legacyArea: 0, taskIds: ["a"], missingTaskIds: ["missing"] });
  assert.equal(validGoalTree(tree, [{ id: "a" }], original), true); assert.equal(validGoalTree(tree, [{ id: "a" }]), false);
  assert.deepEqual(goalTreeFromMandala(undefined, []), { goal: "", groups: [] });
});
test("variable group IDs stay stable through growth and removal while task records stay unchanged", () => {
  const tasks = [{ id: "a", title: "Keep", done: true }], before = structuredClone(tasks);
  let tree = { goal: "Goal", groups: [] };
  for (let i = 0; i < 32; i++) tree = addGoalGroup(tree, `group-${i}`, `Group ${i}`, tasks);
  assert.equal(validGoalTree(tree, tasks), true); assert.throws(() => addGoalGroup(tree, "extra", "Extra", tasks));
  tree = linkGoalTask(tree, "group-31", "a", tasks); tree = removeGoalGroup(tree, "group-0");
  assert.equal(tree.groups.at(-1).id, "group-31"); assert.deepEqual(tree.groups.at(-1).taskIds, ["a"]); assert.deepEqual(tasks, before);
  tree = removeGoalGroup(tree, "group-31"); assert.deepEqual(tasks, before); assert.equal(tree.groups.length, 30);
});
test("missing groups/tasks, duplicated IDs and forged unresolved links cannot enter an active tree", () => {
  const tasks = [{ id: "a" }], tree = { goal: "Goal", groups: [{ id: "one", title: "One", taskIds: ["a"] }] };
  assert.throws(() => linkGoalTask(tree, "one", "absent", tasks)); assert.throws(() => removeGoalGroup(tree, "absent"));
  for (const groups of [[...tree.groups, tree.groups[0]], [{ ...tree.groups[0], taskIds: ["a", "a"] }], [{ ...tree.groups[0], taskIds: ["missing"] }], [{ ...tree.groups[0], missingTaskIds: ["missing"] }], [{ ...tree.groups[0], title: "x".repeat(61) }]]) assert.equal(validGoalTree({ ...tree, groups }, tasks), false);
  const original = legacy(), converted = goalTreeFromMandala(original, tasks);
  assert.equal(validGoalTree({ ...converted, groups: converted.groups.map((g, i) => i === 0 ? { ...g, missingTaskIds: ["invented"] } : g) }, tasks, original), false);
  assert.equal(validGoalTree({ ...tree, groups: [{ ...tree.groups[0], missingTaskIds: null }] }, tasks), false);
  assert.equal(validGoalTree({ ...tree, groups: [{ ...tree.groups[0], legacyArea: 8 }] }, tasks, original), false);
});
test("task deletion unlinks all groups, and completed tasks remain the same task identities", () => {
  const tasks = [{ id: "a", done: true }, { id: "b", done: false }];
  const tree = { goal: "Goal", groups: [{ id: "one", title: "One", taskIds: ["a", "b"] }, { id: "two", title: "Two", taskIds: ["a"] }] };
  const next = unlinkGoalTasks(tree, new Set(["a"])); assert.deepEqual(next.groups.map(g => g.taskIds), [["b"], []]);
  assert.equal(validGoalTree(next, tasks.filter(t => t.id !== "a")), true); assert.equal(tasks[0].done, true); assert.deepEqual(tree.groups[0].taskIds, ["a", "b"]);
});
test("link bounds are explicit and repeated linking never creates duplicate active refs", () => {
  const tasks = Array.from({ length: 5000 }, (_, i) => ({ id: String(i) }));
  const tree = { goal: "Goal", groups: [{ id: "one", title: "One", taskIds: tasks.map(t => t.id) }, { id: "two", title: "Two", taskIds: [] }] };
  assert.equal(validGoalTree(tree, tasks), true); assert.equal(linkGoalTask(tree, "one", "0", tasks).groups[0].taskIds.length, 5000);
  assert.throws(() => linkGoalTask(tree, "two", "0", tasks)); assert.equal(tree.groups[1].taskIds.length, 0);
});
test("8x8 projection refuses ninth groups or ninth tasks instead of truncating data", () => {
  const tree = { goal: "Goal", groups: [{ id: "one", title: "One", taskIds: Array.from({ length: 8 }, (_, i) => String(i)) }] };
  const projected = goalTreeProjection(tree); assert.equal(projected.areas.length, 8); assert.deepEqual(projected.areas[0].taskIds, tree.groups[0].taskIds);
  assert.equal(goalTreeProjection({ ...tree, groups: [{ ...tree.groups[0], taskIds: [...tree.groups[0].taskIds, "eight"] }] }), null);
  assert.equal(goalTreeProjection({ ...tree, groups: Array.from({ length: 9 }, (_, i) => ({ id: String(i), title: String(i), taskIds: [] })) }), null);
  assert.equal(tree.groups[0].taskIds.length, 8);
});
