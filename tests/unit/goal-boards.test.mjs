import test from "node:test";
import assert from "node:assert/strict";
import { addGoalBoard, alignGoalDraft, editGoalBoardDraft, emptyGoalWorkspace, firstGoalId, goalBoardTree, goalDraftConflict, planGoalBoards, saveGoalBoard, validGoalWorkspace, hasEmptyCoreGoal, EMPTY_CORE_GOAL_MESSAGE } from "../../app/todo/goal-boards.ts";
import { goalBoard, updateGoalBoard } from "../../app/todo/goal-draft.ts";
import { deletePlanTasks } from "../../app/todo/goal-actions.ts";
import { validPlan } from "../../supabase/functions/_shared/plan.ts";
import { loadPlan } from "../../supabase/functions/_shared/plan-migration.ts";
import { parsePlanRequest } from "../../supabase/functions/plan-sync/request.ts";
import { decodeDraft, draftKey, saveDraft } from "../../app/todo/draft-store.ts";
import { createRecurrence } from "../../supabase/functions/_shared/repeat-actions.ts";

const task = id => ({ id, title: id, notes: "Keep notes", plannedDate: "2026-10-31", startTime: null, minutes: null, bufferMinutes: null, endTime: null, endDate: null, endDayOffset: null, priority: "normal", done: false });
const plan = () => ({ schemaVersion: 5, start: "09:00", tasks: [task("a"), task("b")], reviewsByDate: { "2026-10-31": "Keep review" }, goalTree: { goal: "Original goal", groups: [{ id: "existing", title: "Original subgoal", taskIds: ["a"] }] } });
const boardFor = (p, id) => goalBoard(goalBoardTree(p, id), planGoalBoards(p).find(b => b.id === id).layout);
const change = (p, id, edit) => { const board = structuredClone(boardFor(p, id)); edit(board); return editGoalBoardDraft(p, id, board); };

test("adding goals preserves the original tree, archive, duplicate cell positions, and unrelated plan data", () => {
  const p = plan(), archive = goalBoard(p.goalTree);
  archive.areas[0].taskIds = ["", "", "a", "", "a", "", "", ""];
  p.mandala = archive;
  const raw = JSON.stringify(p), next = addGoalBoard(p, "second");
  assert.equal(JSON.stringify(p), raw);
  assert.deepEqual(next.goalTree, p.goalTree); assert.deepEqual(next.tasks, p.tasks); assert.deepEqual(next.reviewsByDate, p.reviewsByDate);
  assert.deepEqual(boardFor(next, firstGoalId), archive);
  assert.equal(boardFor(next, "second").goal, "");
  assert.equal(boardFor(next, "second").areas.every(area => !area.title && area.taskIds.every(id => !id)), true);
  assert.equal(validPlan(next), true);
});

test("two goals share task identities while keeping titles, links, repeated slots, and empty slots separate after reload", () => {
  let p = addGoalBoard(plan(), "second");
  p = saveGoalBoard(p, "second", change(p, "second", b => { b.goal = "Health"; b.areas[5].title = "Exercise"; b.areas[5].taskIds[6] = "a"; b.areas[5].taskIds[3] = "a"; }));
  const second = structuredClone(boardFor(p, "second"));
  p = saveGoalBoard(p, firstGoalId, change(p, firstGoalId, b => { b.goal = "Career"; b.areas[0].taskIds[7] = "b"; }));
  p = loadPlan(JSON.stringify(p)).plan;
  assert.deepEqual(boardFor(p, "second"), second);
  assert.equal(boardFor(p, firstGoalId).goal, "Career"); assert.equal(boardFor(p, firstGoalId).areas[0].taskIds[7], "b");
  assert.equal(p.goalTree.groups.filter(g => g.taskIds.includes("a")).length, 2);
  assert.equal(p.tasks.length, 2);
  const request = parsePlanRequest(JSON.stringify({ action: "push", version: 1, plan: p }));
  assert.equal(request.ok, true); assert.deepEqual(request.body.plan.goalBoards, p.goalBoards);
});

test("a pending edit survives switching and reload, remains account scoped, and a quota failure preserves its previous bytes", () => {
  const p = addGoalBoard(plan(), "second"), values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const one = change(p, firstGoalId, b => { b.goal = "Pending first"; }), two = change(p, "second", b => { b.goal = "Pending second"; });
  const pending = { ...emptyGoalWorkspace, selectedId: "second", drafts: { [firstGoalId]: one, second: two } };
  saveDraft(storage, "account-a", "goal-boards", pending, validGoalWorkspace);
  saveDraft(storage, "account-b", "goal-boards", emptyGoalWorkspace, validGoalWorkspace);
  const restored = decodeDraft(storage.getItem(draftKey("account-a", "goal-boards")), validGoalWorkspace).data;
  assert.equal(restored.drafts[firstGoalId].value.goal, "Pending first"); assert.equal(restored.drafts.second.value.goal, "Pending second");
  assert.equal(decodeDraft(storage.getItem(draftKey("account-b", "goal-boards")), validGoalWorkspace).data.selectedId, null);
  const bytes = storage.getItem(draftKey("account-a", "goal-boards"));
  assert.throws(() => saveDraft({ ...storage, setItem() { throw Error("quota"); } }, "account-a", "goal-boards", { ...pending, selectedId: firstGoalId }, validGoalWorkspace));
  assert.equal(storage.getItem(draftKey("account-a", "goal-boards")), bytes);
});

test("concurrent edits to another board merge, while edits and layout changes to the same board are rejected", () => {
  const p = addGoalBoard(plan(), "second"), draftA = change(p, firstGoalId, b => { b.goal = "A edit"; }), draftB = change(p, "second", b => { b.goal = "B edit"; });
  const afterB = saveGoalBoard(p, "second", draftB);
  assert.equal(goalDraftConflict(afterB, firstGoalId, draftA), false);
  const both = saveGoalBoard(afterB, firstGoalId, draftA);
  assert.equal(boardFor(both, firstGoalId).goal, "A edit"); assert.equal(boardFor(both, "second").goal, "B edit");
  assert.throws(() => saveGoalBoard(both, firstGoalId, draftA), /다른 화면/);
  const positional = change(p, firstGoalId, b => { b.areas[0].taskIds[4] = "a"; b.areas[0].taskIds[0] = ""; });
  const moved = saveGoalBoard(p, firstGoalId, positional);
  assert.equal(goalDraftConflict(moved, firstGoalId, draftA), true);
});

test("resetting the selected goal keeps every other goal, shared task, and recurrence association", () => {
  let p = addGoalBoard(plan(), "second");
  p = createRecurrence(p, "a", "series", { frequency: "daily", startDate: "2026-10-31", interval: 1, untilDate: "2026-11-01" }, { from: "2026-10-31", through: "2026-11-01" });
  p = saveGoalBoard(p, "second", change(p, "second", b => { b.goal = "Health"; b.areas[1].title = "Walking"; b.areas[1].taskIds[2] = "b"; }));
  const tree = structuredClone(goalBoardTree(p, firstGoalId)), series = structuredClone(p.recurrences), tasks = structuredClone(p.tasks);
  p = saveGoalBoard(p, "second", change(p, "second", b => { b.goal = ""; b.areas.forEach(area => { area.title = ""; area.taskIds.fill(""); }); }));
  assert.deepEqual(goalBoardTree(p, firstGoalId), tree); assert.deepEqual(p.recurrences, series); assert.deepEqual(p.tasks, tasks);
  assert.equal(boardFor(p, "second").areas.every(a => !a.title && a.taskIds.every(id => !id)), true);
  assert.equal(validPlan(p), true);
});

test("legacy unsaved edits are aligned to stable per-board slots without losing their original base or task links", () => {
  const empty = { ...plan(), goalTree: { goal: "", groups: [] } };
  assert.deepEqual(planGoalBoards(empty), []);
  // The empty state restores a legacy draft by explicitly creating its board.
  const p = addGoalBoard(empty, firstGoalId), meta = planGoalBoards(p)[0];
  const board = goalBoard(p.goalTree); board.goal = "Unsaved old goal"; board.areas[6].title = "Old subgoal"; board.areas[6].taskIds[5] = "a";
  const oldDraft = { base: p.goalTree, value: updateGoalBoard(p.goalTree, board), board, baseBoard: goalBoard(p.goalTree) };
  const aligned = alignGoalDraft(oldDraft, meta);
  assert.equal(goalDraftConflict(p, meta.id, aligned), false);
  const saved = saveGoalBoard(p, meta.id, aligned);
  assert.deepEqual(boardFor(saved, meta.id), board); assert.deepEqual(p.goalTree.groups, []);
});

test("malformed board metadata and forged cross-board writes cannot replace the valid plan", () => {
  const p = addGoalBoard(plan(), "second"), meta = p.goalBoards;
  for (const goalBoards of [[], [meta[0], meta[0]], [{ ...meta[0], id: "__proto__" }, meta[1]], [meta[0], { ...meta[1], groupIds: meta[0].groupIds }], [{ ...meta[0], groupIds: Array.from({ length: 8 }, (_, i) => `other-${i}`) }, meta[1]], [{ ...meta[0], layout: {} }, meta[1]]]) {
    assert.equal(validPlan({ ...p, goalBoards }), false);
    assert.equal(parsePlanRequest(JSON.stringify({ action: "push", version: 1, plan: { ...p, goalBoards } })).ok, false);
  }
  const forged = change(p, "second", b => { b.goal = "Forged"; }); forged.value.groups[0].id = "existing";
  assert.throws(() => saveGoalBoard(p, "second", forged), /칸 구성/);
  assert.throws(() => addGoalBoard(p, "second"));
  assert.equal(validGoalWorkspace({ selectedId: "second", drafts: { second: {} } }), false);
});

test("oversized legacy goals stay intact and do not prevent opening a separate empty board", () => {
  const p = { ...plan(), goalTree: { goal: "Large", groups: Array.from({ length: 9 }, (_, i) => ({ id: `large-${i}`, title: `Group ${i}`, taskIds: ["a"] })) } };
  const next = addGoalBoard(p, "second");
  assert.equal(boardFor(next, firstGoalId), null); assert.equal(goalBoardTree(next, firstGoalId).groups.length, 9);
  assert.equal(boardFor(next, "second").goal, ""); assert.deepEqual(next.goalTree, p.goalTree);
});

test("shared task deletion removes canonical links from active and inactive boards without removing either goal", () => {
  let p = addGoalBoard(plan(), "second");
  p = saveGoalBoard(p, "second", change(p, "second", b => { b.goal = "Health"; b.areas[2].title = "Exercise"; b.areas[2].taskIds[7] = "a"; b.areas[2].taskIds[4] = "b"; }));
  const next = deletePlanTasks(p, new Set(["a"]));
  assert.equal(validPlan(next), true); assert.equal(next.goalBoards.length, 2);
  assert.equal(goalBoardTree(next, "second").groups[2].title, "Exercise");
  assert.deepEqual(goalBoardTree(next, "second").groups[2].taskIds, ["b"]);
  assert.equal(goalBoardTree(next, firstGoalId).groups.every(g => !g.taskIds.includes("a")), true);
});

test("the first empty board may be created once; blank and whitespace-only stored cores block another board without mutation", () => {
  const empty = { ...plan(), goalTree: { goal: "", groups: [] } };
  assert.equal(hasEmptyCoreGoal(empty), false);
  const first = addGoalBoard(empty, "first");
  assert.equal(hasEmptyCoreGoal(first), true);
  const before = JSON.stringify(first);
  assert.throws(() => addGoalBoard(first, "second"), { message: EMPTY_CORE_GOAL_MESSAGE });
  assert.equal(JSON.stringify(first), before);
  for (const goal of ["", "   ", "\t\n", "\u3000\u00a0"]) {
    const p = { ...plan(), goalTree: { ...plan().goalTree, goal } };
    const raw = JSON.stringify(p);
    assert.equal(hasEmptyCoreGoal(p), true, "legacy core with existing groups must be checked");
    assert.throws(() => addGoalBoard(p, "new"), { message: EMPTY_CORE_GOAL_MESSAGE });
    assert.equal(JSON.stringify(p), raw); assert.equal(p.goalTree.groups[0].taskIds[0], "a");
  }
});

test("every stored board is checked, including an inactive empty core; filling it unlocks a new board while links, layouts and drafts remain intact", () => {
  let p = addGoalBoard(plan(), "second");
  const draft = change(p, "second", b => { b.goal = "Pending unsaved goal"; b.areas[3].taskIds[4] = "b"; });
  const draftBytes = JSON.stringify(draft), before = JSON.stringify(p);
  assert.equal(hasEmptyCoreGoal(p), true);
  assert.throws(() => addGoalBoard(p, "third"), { message: EMPTY_CORE_GOAL_MESSAGE });
  assert.equal(JSON.stringify(p), before); assert.equal(JSON.stringify(draft), draftBytes);
  p = saveGoalBoard(p, "second", draft);
  assert.equal(hasEmptyCoreGoal(p), false);
  const filledBytes = JSON.stringify(p), next = addGoalBoard(p, "third");
  assert.equal(JSON.stringify(p), filledBytes); assert.equal(next.goalBoards.length, 3);
  assert.deepEqual(next.goalTree, p.goalTree); assert.deepEqual(next.tasks, p.tasks); assert.deepEqual(next.reviewsByDate, p.reviewsByDate);
  assert.deepEqual(next.goalBoards.slice(0, 2), p.goalBoards); assert.equal(JSON.stringify(draft), draftBytes);
  const emptyFirst = saveGoalBoard(p, firstGoalId, change(p, firstGoalId, b => { b.goal = " "; }));
  assert.equal(boardFor(emptyFirst, "second").goal, "Pending unsaved goal");
  assert.throws(() => addGoalBoard(emptyFirst, "third"), { message: EMPTY_CORE_GOAL_MESSAGE });
});

test("filled boards keep duplicate ID and 32-board limits; refusal never removes existing blank boards or migration metadata", () => {
  let p = plan();
  for (let i = 1; i < 32; i++) {
    p = addGoalBoard(p, `board-${i}`);
    p = saveGoalBoard(p, `board-${i}`, change(p, `board-${i}`, b => { b.goal = `Goal ${i}`; }));
  }
  assert.equal(hasEmptyCoreGoal(p), false); assert.equal(validPlan(p), true);
  const raw = JSON.stringify(p);
  assert.throws(() => addGoalBoard(p, "over-limit"), /최대 32개/);
  assert.equal(JSON.stringify(p), raw);
  let two = addGoalBoard(plan(), "second");
  two = saveGoalBoard(two, "second", change(two, "second", b => { b.goal = "Filled"; }));
  assert.throws(() => addGoalBoard(two, "second"), /다시 시도/);
  two = saveGoalBoard(two, "second", change(two, "second", b => { b.goal = ""; }));
  const loaded = loadPlan(JSON.stringify(two)); assert.equal(loaded.ok, true);
  const before = JSON.stringify(loaded.plan);
  assert.throws(() => addGoalBoard(loaded.plan, "third"), { message: EMPTY_CORE_GOAL_MESSAGE });
  assert.equal(JSON.stringify(loaded.plan), before); assert.equal(loaded.plan.goalBoards.length, 2);
});
