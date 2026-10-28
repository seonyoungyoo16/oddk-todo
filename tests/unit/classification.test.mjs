import test from "node:test";
import assert from "node:assert/strict";
import { validPlan, validTaskSnapshot } from "../../supabase/functions/_shared/plan.ts";
import { loadPlan } from "../../supabase/functions/_shared/plan-migration.ts";
import { validCategories, validTags, normalizeTagName } from "../../supabase/functions/_shared/taxonomy.ts";
import { saveCategory, saveTag, removeCategory, removeTag, filterClassifiedTasks } from "../../app/todo/classification-actions.ts";
import { makeUndo, applyUndo, validUndo } from "../../app/todo/plan-history.ts";
import { validWorkspace, emptyWorkspace } from "../../app/todo/workspace-draft.ts";
import { validClassificationDraft, emptyClassificationDraft } from "../../app/todo/classification-draft.ts";
import { saveDraft, decodeDraft, draftKey } from "../../app/todo/draft-store.ts";
import { selectDay } from "../../app/todo/day-selectors.ts";
import { availabilitySummary } from "../../app/todo/availability.ts";
const task = (id, patch = {}) => ({ id, title: id, notes: "", minutes: 60, bufferMinutes: 10, startTime: "09:00", endTime: "10:00", endDate: "2026-10-28", endDayOffset: 0, plannedDate: "2026-10-28", priority: "normal", done: false, ...patch });
const plan = () => ({ schemaVersion: 4, start: "09:00", tasks: [task("a"), task("b")], reviewsByDate: {}, mandala: { goal: "Preserve", areas: Array.from({ length: 8 }, (_, i) => ({ title: String(i), taskIds: [i === 0 ? "a" : "", ...Array(7).fill("")] })) } });
test("classification filters and partial manager input survive reload under separate account scopes", () => {
  const data = new Map(), storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  const workspace = { ...emptyWorkspace, input: "아직 등록하지 않음", classification: { category: "category:work", tags: ["exercise"], search: "메모" } };
  saveDraft(storage, "local", "workspace", workspace, validWorkspace);
  assert.deepEqual(decodeDraft(storage.getItem(draftKey("local", "workspace")), validWorkspace).data, workspace);
  assert.equal(storage.getItem(draftKey("other-account", "workspace")), null);
  const partial = { ...emptyClassificationDraft, name: "미완성 분류" };
  saveDraft(storage, "local", "classification", partial, validClassificationDraft);
  assert.deepEqual(decodeDraft(storage.getItem(draftKey("local", "classification")), validClassificationDraft).data, partial);
  assert.equal(validWorkspace({ ...workspace, classification: { ...workspace.classification, tags: undefined } }), false);
  assert.equal(validWorkspace({ ...workspace, classification: { ...workspace.classification, tags: ["x", "x"] } }), false);
  assert.equal(validClassificationDraft({ ...partial, id: "deleted", base: null }), false);
  assert.equal(validClassificationDraft({ ...partial, color: "red" }), false);
});
test("category filtering never makes a hidden overlapping event free", () => {
  const tasks = [task("a", { categoryId: "work" }), task("b", { categoryId: "private", startTime: "09:30", endTime: "10:30" })];
  const filtered = filterClassifiedTasks(tasks, { category: "category:work", tags: [], search: "" });
  assert.deepEqual(filtered.map(t => t.id), ["a"]);
  const summary = availabilitySummary(selectDay(tasks, "2026-10-28"), { start: "09:00", end: "18:00", fixed: [] });
  assert.equal(summary.occupiedMinutes, 90); assert.equal(summary.freeMinutes, 450); assert.equal(summary.overlapMinutes, 30);
  assert.equal(summary.overlaps.find(e => e.task.id === "a").others[0].id, "b");
});
test("classification names normalize without losing IDs and duplicate names/colors are rejected", () => {
  let value = saveCategory(plan(), { id: "work", name: "  Work  ", color: "#336699" });
  assert.equal(value.categories[0].name, "Work");
  assert.throws(() => saveCategory(value, { id: "other", name: "work", color: "#112233" }));
  assert.throws(() => saveCategory(value, { id: "other", name: "Private", color: "red" }));
  value = saveTag(value, { id: "exercise", name: " #운동 " }); assert.equal(value.tags[0].name, "운동");
  assert.equal(normalizeTagName("  ##  운동 "), "운동");
  assert.equal(validTags([{ id: "a", name: "é" }, { id: "b", name: "e\u0301" }]), false);
  assert.equal(validCategories([{ id: "a", name: "a\u0000b", color: "#123456" }]), false);
});
test("category/tag bounds, canonical names and per-task tag limits are enforced", () => {
  const categories = Array.from({ length: 30 }, (_, i) => ({ id: String(i), name: "Category " + i, color: "#ABCDEF" }));
  const tags = Array.from({ length: 100 }, (_, i) => ({ id: String(i), name: "Tag " + i }));
  assert.equal(validCategories(categories), true); assert.equal(validTags(tags), true);
  assert.equal(validCategories([...categories, { id: "extra", name: "Extra", color: "#123456" }]), false); assert.equal(validTags([...tags, { id: "extra", name: "Extra" }]), false);
  assert.equal(validCategories([{ id: "a", name: "x".repeat(31), color: "#123456" }]), false); assert.equal(validTags([{ id: "a", name: "#운동" }]), false);
  const value = { ...plan(), tags, tasks: [task("a", { tagIds: tags.slice(0, 10).map(t => t.id) })] };
  assert.equal(validPlan(value), true);
  assert.equal(validPlan({ ...value, tasks: [task("a", { tagIds: tags.slice(0, 11).map(t => t.id) })] }), false);
  assert.equal(validPlan({ ...value, tasks: [task("a", { tagIds: ["0", "0"] })] }), false);
});
test("snapshot checks retain references while full plan validation rejects missing definitions", () => {
  const linked = task("a", { categoryId: "work", tagIds: ["exercise"] });
  assert.equal(validTaskSnapshot(linked, 4), true);
  assert.equal(validPlan({ ...plan(), tasks: [linked] }), false);
  const value = { ...plan(), tasks: [linked], categories: [{ id: "work", name: "업무", color: "#123456" }], tags: [{ id: "exercise", name: "운동" }] };
  assert.equal(validPlan(value), true);
  const editor = { base: linked, baseMandala: value.mandala, title: "Draft", work: "50", buffer: "10", start: "09:00", date: "2026-10-28", priority: "normal", done: false, links: [] };
  assert.equal(validWorkspace({ ...emptyWorkspace, editingId: "a", editors: { a: editor } }), true);
  assert.equal(validPlan({ ...value, tasks: [linked, linked] }), false);
});
test("category/tag removal keeps tasks, goal links and times and undo restores definitions and refs", () => {
  const before = { ...plan(), categories: [{ id: "work", name: "업무", color: "#123456" }], tags: [{ id: "exercise", name: "운동" }], tasks: [task("a", { categoryId: "work", tagIds: ["exercise"] }), task("b")] };
  const original = structuredClone(before), deletedCategory = removeCategory(before, "work"), deletedTag = removeTag(before, "exercise");
  assert.equal(deletedCategory.tasks[0].categoryId, null); assert.equal(deletedCategory.tasks.length, 2); assert.deepEqual(deletedCategory.mandala, before.mandala); assert.equal(deletedCategory.tasks[0].endTime, "10:00");
  assert.deepEqual(deletedTag.tasks[0].tagIds, []); assert.equal(deletedTag.tasks[0].categoryId, "work");
  for (const after of [deletedCategory, deletedTag]) { const undo = makeUndo(before, after, "Remove classification"); assert.equal(validUndo(undo), true); assert.deepEqual(applyUndo(after, undo), before); }
  assert.deepEqual(before, original);
});
test("category, exact tag AND and title/note searches combine without changing stored order", () => {
  const tasks = [task("a", { title: "운동 계획", categoryId: "all", tagIds: ["exercise", "morning"], notes: "러닝 준비" }), task("b", { title: "#운동", categoryId: "work" }), task("c", { title: "개인 운동", tagIds: ["exercise"] })], original = structuredClone(tasks);
  const filter = { category: "all", tags: ["exercise"], search: "" };
  assert.deepEqual(filterClassifiedTasks(tasks, filter).map(t => t.id), ["a", "c"]);
  assert.deepEqual(filterClassifiedTasks(tasks, { ...filter, tags: ["exercise", "morning"] }).map(t => t.id), ["a"]);
  assert.deepEqual(filterClassifiedTasks(tasks, { ...filter, category: "category:all", search: "러닝" }).map(t => t.id), ["a"]);
  assert.deepEqual(filterClassifiedTasks(tasks, { ...filter, category: "none" }).map(t => t.id), ["c"]);
  assert.equal(filterClassifiedTasks(tasks, { ...filter, tags: ["missing"] }).length, 0);
  assert.deepEqual(filterClassifiedTasks(tasks, { category: "all", tags: [], search: "" }), tasks); assert.deepEqual(tasks, original);
});
test("optional V4 classification extensions survive old-plan normalization without a schema reinterpretation", () => {
  const value = { ...plan(), categories: [{ id: "work", name: "업무", color: "#123456" }], tasks: [task("a", { categoryId: "work", tagIds: [] })] };
  assert.deepEqual(loadPlan(JSON.stringify(value)).plan, value); assert.equal(loadPlan(JSON.stringify(value)).migrated, false);
  const v3 = { ...value, schemaVersion: 3, tasks: value.tasks.map(t => { const old = { ...t }; delete old.endTime; delete old.endDate; delete old.endDayOffset; return old; }) };
  assert.deepEqual(loadPlan(JSON.stringify(v3)).plan, value);
});
