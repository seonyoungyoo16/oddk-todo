import test from "node:test";
import assert from "node:assert/strict";
import { validGoalDraft, validGoalSnapshot, missingGoalDraftTasks } from "../../app/todo/goal-draft.ts";
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
