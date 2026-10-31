import test from "node:test";
import assert from "node:assert/strict";
import { goalBoard, updateGoalBoard, validGoalDraft, validGoalSnapshot, missingGoalDraftTasks } from "../../app/todo/goal-draft.ts";
import { validGoalTree } from "../../supabase/functions/_shared/goal-tree.ts";

test("goal draft keeps historical links after remote deletion but cannot persist dangling plan links", () => {
  const tree = { goal: "Goal", groups: [{ id: "g", title: "Group", taskIds: ["removed", "kept"] }] };
  const draft = { base: structuredClone(tree), value: tree };
  const raw = JSON.stringify(draft), tasks = [{ id: "kept" }];
  assert.equal(validGoalDraft(JSON.parse(raw)), true);
  assert.equal(validGoalTree(tree, tasks), false);
  assert.deepEqual(missingGoalDraftTasks(draft, tasks), ["removed"]);
  assert.equal(JSON.stringify(draft), raw);
});

test("mandala editing preserves goal IDs, historical references, and original data", () => {
  const archive = { goal: "Original", areas: Array.from({ length: 8 }, () => ({ title: "", taskIds: ["orphan", ...Array(7).fill("")] })) };
  const tree = { goal: "Current", groups: [{ id: "stable", title: "Group", taskIds: ["kept"], legacyArea: 0, missingTaskIds: ["orphan"] }] };
  const original = JSON.stringify(tree), board = goalBoard(tree);
  board.goal = "Edited"; board.areas[0].title = "Renamed"; board.areas[0].taskIds[4] = "new";
  const next = updateGoalBoard(tree, board);
  assert.equal(next.goal, "Edited"); assert.equal(next.groups.length, 8);
  assert.equal(next.groups[0].id, "stable"); assert.equal(next.groups[0].legacyArea, 0);
  assert.deepEqual(next.groups[0].taskIds, ["kept", "new"]);
  assert.deepEqual(next.groups[0].missingTaskIds, ["orphan"]);
  assert.equal(validGoalTree(next, [{ id: "kept" }, { id: "new" }], archive), true);
  assert.equal(JSON.stringify(tree), original);
});

test("mandala keeps empty and repeated cell positions across draft reloads", () => {
  const tree = { goal: "G", groups: [{ id: "g", title: "Group", taskIds: ["a"] }] };
  const board = goalBoard(tree);
  board.areas[0].taskIds = ["", "", "a", "", "", "a", "", ""];
  const value = updateGoalBoard(tree, board);
  const restored = JSON.parse(JSON.stringify({ base: value, value, board, baseBoard: board }));
  assert.equal(validGoalDraft(restored), true);
  assert.deepEqual(goalBoard(restored.value, restored.board).areas[0].taskIds, board.areas[0].taskIds);
  assert.deepEqual(restored.value.groups[0].taskIds, ["a"]);
  assert.equal(validGoalDraft({ ...restored, board: { goal: "invalid" } }), false);
});

test("mandala falls back to current links when saved layout is outdated and never truncates oversized goals", () => {
  const tree = { goal: "G", groups: [{ id: "g", title: "Current", taskIds: ["new"] }] };
  const stale = goalBoard({ goal: "Old", groups: [{ id: "g", title: "Old", taskIds: ["old"] }] });
  assert.equal(goalBoard(tree, stale).goal, "G");
  assert.deepEqual(goalBoard(tree, stale).areas[0].taskIds.filter(Boolean), ["new"]);
  for (const oversized of [
    { goal: "G", groups: Array.from({ length: 9 }, (_, i) => ({ id: String(i), title: "", taskIds: [] })) },
    { goal: "G", groups: [{ id: "g", title: "", taskIds: Array.from({ length: 9 }, (_, i) => String(i)) }] },
  ]) {
    const original = JSON.stringify(oversized);
    assert.equal(goalBoard(oversized), null);
    assert.throws(() => updateGoalBoard(oversized, stale));
    assert.equal(JSON.stringify(oversized), original);
  }
});

test("reset empties every mandala field without changing stable group identities or source links", () => {
  const tree = { goal: "Goal", groups: [{ id: "stable", title: "Subgoal", taskIds: ["a"] }] };
  const blank = { goal: "", areas: Array.from({ length: 8 }, () => ({ title: "", taskIds: Array(8).fill("") })) };
  const reset = updateGoalBoard(tree, blank);
  assert.equal(reset.goal, ""); assert.equal(reset.groups.length, 8);
  assert.equal(reset.groups[0].id, "stable");
  assert.equal(reset.groups.every(group => group.title === "" && group.taskIds.length === 0), true);
  assert.deepEqual(tree.groups[0].taskIds, ["a"]);
  assert.equal(validGoalTree(reset, [{ id: "a" }]), true);
});

test("goal draft validates snapshot structure and archive without truncating references", () => {
  const tree = { goal: "G", groups: Array.from({ length: 9 }, (_, index) => ({ id: String(index), title: "", taskIds: Array.from({ length: 9 }, (_, n) => `${index}-${n}`) })) };
  assert.equal(validGoalSnapshot(tree), true);
  for (const value of [{ ...tree, groups: [...tree.groups, tree.groups[0]] }, { goal: "G", groups: [{ id: "g", title: "G", taskIds: [""] }] }, { goal: "G", groups: [{ id: "g", title: "G", taskIds: ["x", "x"] }] }, { ...tree, groups: Array(33).fill(tree.groups[0]) }]) assert.equal(validGoalSnapshot(value), false);
  assert.equal(validGoalDraft({ base: tree, value: tree, archive: null }), false);
  const archive = { goal: "Old", areas: Array.from({ length: 8 }, () => ({ title: "", taskIds: ["orphan", "", "", "", "", "", "", ""] })) };
  const legacy = { goal: "G", groups: [{ id: "g", title: "G", taskIds: [], legacyArea: 0, missingTaskIds: ["orphan"] }] };
  assert.equal(validGoalDraft({ base: legacy, value: legacy, archive }), true);
  assert.equal(validGoalDraft({ base: legacy, value: legacy }), false);
  assert.equal(validGoalSnapshot({ ...legacy, groups: [{ ...legacy.groups[0], missingTaskIds: ["invented"] }] }, archive), false);
});
