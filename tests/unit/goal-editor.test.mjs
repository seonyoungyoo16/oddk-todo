import test from "node:test";
import assert from "node:assert/strict";
import { taskGoalIds, editorGoalIds, editorGoalConflict, legacyEditorLinksChanged, convertLegacyEditorLinks, mergeLegacyGoalDraft } from "../../app/todo/goal-editor.ts";
import { goalTreeFromMandala } from "../../supabase/functions/_shared/goal-tree.ts";
import { validWorkspace, emptyWorkspace } from "../../app/todo/workspace-draft.ts";
const task = { id: "a", title: "A", notes: "", plannedDate: null, minutes: null, bufferMinutes: null, startTime: null, endTime: null, endDate: null, endDayOffset: null, priority: "normal", done: false };
const archive = { goal: "G", areas: Array.from({ length: 8 }, (_, i) => ({ title: "Area " + i, taskIds: [i === 0 ? "a" : "", ...Array(7).fill("")] })) };
const plan = { schemaVersion: 5, tasks: [task], start: "09:00", reviewsByDate: {}, mandala: archive, goalTree: goalTreeFromMandala(archive, [task]) };
const editor = { base: task, baseMandala: archive, title: "A", work: "", buffer: "", start: "", date: "", priority: "normal", done: false, links: ["0:0"] };

test("historical editor links require explicit conversion only when edited and support variable group membership", () => {
  assert.equal(legacyEditorLinksChanged(editor), false);
  assert.deepEqual(editorGoalIds(editor, plan), ["legacy-0"]);
  const changed = { ...editor, links: ["1:0", "1:1"] };
  assert.equal(legacyEditorLinksChanged(changed), true);
  assert.deepEqual(convertLegacyEditorLinks(changed, plan), ["legacy-1"]);
  assert.throws(() => convertLegacyEditorLinks(changed, { ...plan, goalTree: { ...plan.goalTree, groups: plan.goalTree.groups.filter(group => group.id !== "legacy-1") } }));
  const modern = { ...editor, baseGoalTree: plan.goalTree, goalLinks: ["ninth"] };
  assert.deepEqual(editorGoalIds(modern, plan), ["ninth"]);
  assert.equal(validWorkspace({ ...emptyWorkspace, editors: { a: modern } }), true);
  assert.equal(validWorkspace({ ...emptyWorkspace, editors: { a: { ...modern, goalLinks: ["x", "x"] } } }), false);
});

test("editor conflict protects this task's membership without blocking unrelated goal edits", () => {
  const modern = { ...editor, baseGoalTree: structuredClone(plan.goalTree), goalLinks: ["legacy-0"] };
  const unrelated = structuredClone(plan); unrelated.goalTree.groups.push({ id: "new", title: "Other", taskIds: [] });
  unrelated.goalTree.groups[0].title = "Renamed";
  assert.equal(editorGoalConflict(modern, unrelated), false);
  unrelated.goalTree.groups[0].taskIds = [];
  assert.equal(editorGoalConflict(modern, unrelated), true);
  assert.deepEqual(taskGoalIds(plan.goalTree, "a"), ["legacy-0"]);
});

test("legacy goal draft imports only deltas, preserves new groups and rejects conflicting names atomically", () => {
  const current = structuredClone(plan); current.goalTree.groups.push({ id: "ninth", title: "New", taskIds: ["a"] });
  const draft = structuredClone(archive); draft.areas[0].title = "Edited"; draft.areas[1].taskIds[0] = "a";
  const raw = JSON.stringify(current), merged = mergeLegacyGoalDraft(current, archive, draft);
  assert.equal(merged.goalTree.groups[0].title, "Edited");
  assert.deepEqual(merged.goalTree.groups.at(-1), current.goalTree.groups.at(-1));
  assert.deepEqual(merged.goalTree.groups[1].taskIds, ["a"]);
  assert.equal(JSON.stringify(current), raw);
  const conflicting = structuredClone(current); conflicting.goalTree.groups[0].title = "Remote";
  assert.throws(() => mergeLegacyGoalDraft(conflicting, archive, draft), /名前|이름/);
  assert.equal(conflicting.goalTree.groups[0].title, "Remote");
  const removed = structuredClone(archive); removed.areas[0].taskIds[0] = "";
  const unlinked = mergeLegacyGoalDraft(current, archive, removed);
  assert.deepEqual(unlinked.goalTree.groups[0].taskIds, []);
  assert.deepEqual(unlinked.goalTree.groups.at(-1).taskIds, ["a"]);
});
