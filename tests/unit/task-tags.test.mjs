import test from "node:test";
import assert from "node:assert/strict";
import { addDraftTag, prepareTaskTags } from "../../app/todo/task-tags.ts";
import { updateSimpleTask } from "../../app/todo/simple-task-editor.ts";
import { validPlan } from "../../supabase/functions/_shared/plan.ts";
import { emptyWorkspace, validWorkspace, withoutEditor } from "../../app/todo/workspace-draft.ts";
import { decodeDraft, draftKey, saveDraft } from "../../app/todo/draft-store.ts";

const task = { id: "a", title: "태그 확인", notes: "보존할 메모", plannedDate: "2026-10-31", startTime: null, endTime: null, endDate: null, endDayOffset: null, minutes: 60, bufferMinutes: 10, done: false, priority: "normal", tagIds: ["existing"] };
const plan = patch => ({ schemaVersion: 5, start: "09:00", reviewsByDate: {}, tags: [{ id: "existing", name: "업무" }], tasks: [structuredClone(task)], goalTree: { goal: "보존할 목표", groups: [{ id: "group", title: "목표", taskIds: ["a"] }] }, ...patch });
const draft = patch => ({ title: task.title, notes: task.notes, work: "50", buffer: "10", done: false, tagIds: ["existing"], ...patch });

test("new tags stay in the editor draft until the task and definition are saved atomically", () => {
  const before = plan(), raw = JSON.stringify(before);
  const pending = addDraftTag(before, draft(), " #개인  계획 ", () => "new");
  assert.deepEqual(pending.pendingTags, [{ id: "new", name: "개인 계획" }]);
  assert.equal(JSON.stringify(before), raw);
  const saved = updateSimpleTask(before, "a", draft(pending));
  assert.deepEqual(saved.tags, [...before.tags, { id: "new", name: "개인 계획" }]);
  assert.deepEqual(saved.tasks[0].tagIds, ["existing", "new"]);
  assert.deepEqual(saved.goalTree, before.goalTree);
  assert.equal(saved.tasks[0].notes, task.notes);
  assert.equal(saved.tasks[0].minutes, 60);
  assert.equal(validPlan(saved), true);
  assert.equal(JSON.stringify(before), raw);
});

test("existing and pending names are reused after hash, whitespace, case and Unicode normalization", () => {
  const before = plan({ tags: [{ id: "existing", name: "Work" }, { id: "korean", name: "가" }] });
  const failId = () => { throw Error("must reuse an existing ID"); };
  assert.deepEqual(addDraftTag(before, { tagIds: [] }, "## work  ", failId).tagIds, ["existing"]);
  assert.deepEqual(addDraftTag(before, { tagIds: [] }, "\u1100\u1161", failId).tagIds, ["korean"]);
  const pending = addDraftTag(before, { tagIds: [] }, "New", () => "temp");
  assert.deepEqual(addDraftTag(before, pending, " #new ", failId), pending);
});

test("a matching name added remotely resolves to its saved ID without duplicate links", () => {
  const before = plan({ tags: [{ id: "existing", name: "업무" }, { id: "remote", name: "개인" }] });
  const saved = updateSimpleTask(before, "a", draft({ tagIds: ["temporary", "remote"], pendingTags: [{ id: "temporary", name: "개인" }] }));
  assert.deepEqual(saved.tasks[0].tagIds, ["remote"]);
  assert.equal(saved.tags.length, 2);
  assert.equal(validPlan(saved), true);
});

test("unselected new definitions are not created and invalid edits leave the whole plan intact", () => {
  const before = plan(), raw = JSON.stringify(before);
  const pending = { pendingTags: [{ id: "new", name: "개인" }] };
  const saved = updateSimpleTask(before, "a", draft(pending));
  assert.deepEqual(saved.tags, before.tags);
  assert.throws(() => updateSimpleTask(before, "a", draft({ ...pending, tagIds: ["new"], title: " " })));
  assert.throws(() => updateSimpleTask(before, "a", draft({ ...pending, tagIds: ["new"], work: "240", buffer: "1" })));
  assert.equal(JSON.stringify(before), raw);
});

test("saving a nonempty tag input also connects it when the add button was not pressed", () => {
  const saved = updateSimpleTask(plan(), "a", draft({ tagInput: " #바로 저장 " }));
  const tag = saved.tags.find(value => value.name === "바로 저장");
  assert.ok(tag);
  assert.deepEqual(saved.tasks[0].tagIds, ["existing", tag.id]);
  assert.equal(validPlan(saved), true);
});

test("tag input and definition limits reject invalid additions without changing the draft", () => {
  const before = plan(), value = draft(), raw = JSON.stringify(value);
  for (const name of ["", "   ", "###", "x".repeat(31), "bad\u0000name"]) assert.throws(() => addDraftTag(before, value, name, () => "new"));
  const full = { tagIds: Array.from({ length: 10 }, (_, i) => `t${i}`) };
  assert.throws(() => addDraftTag(before, full, "열한 번째", () => "new"), /10개/);
  const crowded = plan({ tags: Array.from({ length: 100 }, (_, i) => ({ id: `t${i}`, name: `태그${i}` })) });
  assert.throws(() => addDraftTag(crowded, { tagIds: [] }, "새 이름", () => "new"), /100개/);
  assert.deepEqual(addDraftTag(crowded, { tagIds: [] }, "태그0", () => "new").tagIds, ["t0"]);
  assert.throws(() => prepareTaskTags(crowded, { tagIds: ["new"], pendingTags: [{ id: "new", name: "새 이름" }] }), /100개/);
  assert.equal(JSON.stringify(value), raw);
});

test("a conflicting temporary ID never renames a different saved tag", () => {
  const before = plan(), raw = JSON.stringify(before);
  assert.throws(() => prepareTaskTags(before, { tagIds: ["existing"], pendingTags: [{ id: "existing", name: "다른 이름" }] }), /바뀌었어요/);
  assert.equal(JSON.stringify(before), raw);
});

test("pending definitions and typed text survive draft reload and explicit cancel removes only the editor", () => {
  const before = plan(), pending = addDraftTag(before, draft(), "새 태그", () => "pending");
  const editor = { ...draft(), ...pending, tagInput: "입력 중", base: before.tasks[0], baseMandala: { goal: "", areas: Array.from({ length: 8 }, () => ({ title: "", taskIds: Array(8).fill("") })) }, start: "", date: "2026-10-31", priority: "normal", links: [] };
  const workspace = { ...emptyWorkspace, input: "다른 입력 보존", editingId: "a", editors: { a: editor } };
  assert.equal(validWorkspace(workspace), true);
  const data = new Map(), storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  saveDraft(storage, "local", "workspace", workspace, validWorkspace);
  const loaded = decodeDraft(storage.getItem(draftKey("local", "workspace")), validWorkspace).data;
  assert.deepEqual(loaded.editors.a.pendingTags, pending.pendingTags);
  assert.equal(loaded.editors.a.tagInput, "입력 중");
  assert.deepEqual(withoutEditor(loaded, "a").editors, {});
  assert.equal(withoutEditor(loaded, "a").input, "다른 입력 보존");
  assert.equal(before.tags.length, 1);
});
