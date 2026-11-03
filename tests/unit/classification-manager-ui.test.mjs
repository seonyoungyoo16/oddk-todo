import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as actions from "../../app/todo/classification-actions.ts";
import { emptyClassificationDraft, validClassificationDraft } from "../../app/todo/classification-draft.ts";
import { sameValue } from "../../app/todo/json-equality.ts";
import { saveDraft, decodeDraft, draftKey } from "../../app/todo/draft-store.ts";

const element = (type, props) => ({ type, props });
function nodes(n) { return !n || typeof n !== "object" ? [] : [n, ...[n.props?.children].flat(Infinity).flatMap(nodes)]; }
function text(n) { return typeof n === "string" || typeof n === "number" ? String(n) : n && typeof n === "object" ? [n.props?.children].flat(Infinity).map(text).join("") : ""; }
const fixturePlan = () => ({ schemaVersion: 5, start: "09:00", reviewsByDate: {}, goalTree: { goal: "kept", groups: [] }, tasks: [], categories: [{ id: "cat", name: "기존 분류", color: "#4778c8" }], tags: [{ id: "tag", name: "기존 태그" }] });
const emptyTagDraft = { ...emptyClassificationDraft, kind: "tag" };
function manager(initial = emptyTagDraft, plan = fixturePlan()) {
  let value = structuredClone(initial), error = "", allowSave = false;
  const sets = [], saves = [], backups = [], exports = {}, stored = new Map();
  const storage = { getItem: key => stored.get(key) ?? null, setItem: (key, raw) => stored.set(key, raw), removeItem: key => stored.delete(key) };
  let validator, slot;
  const draft = { get value() { return value; }, set(next) {
    value = structuredClone(next); sets.push(next);
    try { saveDraft(storage, "local", slot, value, validator); return true; }
    catch { error = "초안을 기기에 저장하지 못했어요."; return false; }
  }, download() { backups.push(storage.getItem(draftKey("local", slot))); } };
  const code = ts.transpileModule(readFileSync(new URL("../../app/todo/classification-controls.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { exports, crypto: { randomUUID: () => "new-category" }, Error, require(name) {
    if (name === "react") return { useState: () => [error, next => { error = next; }] };
    if (name === "react/jsx-runtime") return { jsx: element, jsxs: element };
    if (name === "react-icons/hi2") return {};
    if (name.includes("_shared/taxonomy")) return { taskTagLimit: 10 };
    if (name === "./classification-actions") return actions;
    if (name === "./classification-draft") return { emptyClassificationDraft, validClassificationDraft };
    if (name === "./use-local-draft") return { useLocalDraft(key, initial, valid) {
      slot = key; validator = valid;
      if (storage.getItem(draftKey("local", slot)) === null) saveDraft(storage, "local", slot, value, validator);
      return draft;
    }, DraftFeedback: () => null };
    if (name === "./json-equality") return { sameValue };
    throw Error(name);
  } });
  return { sets, saves, backups, storage, components: exports, get value() { return value; }, get error() { return error; }, allowSave() { allowSave = true; },
    restart() { value = structuredClone(decodeDraft(storage.getItem(draftKey("local", slot)), validator).data); error = ""; },
    render() { return exports.ClassificationManager({ plan, initiallyOpen: true, onSave(next) { saves.push(next); return allowSave; } }); } };
}

test("only tag management is offered; legacy categories and pending draft bytes are not edited on render", () => {
  const p = fixturePlan(), before = JSON.stringify(p), draft = { ...emptyTagDraft, name: "작성 중인 태그" }, h = manager(draft, p);
  for (let i = 0; i < 2; i++) {
    const tree = h.render(), all = nodes(tree);
    assert(!text(tree).includes("카테고리"));
    assert.deepEqual(all.filter(n => n.type === "h3").map(text), ["태그"]);
    assert.deepEqual(all.filter(n => n.props?.className === "oddk-definitionLimit").map(text), ["1/100"]);
    assert(!all.some(n => n.type === "select" || n.props?.type === "color"));
    assert.deepEqual(h.value, draft); assert.equal(h.sets.length, 0); assert.equal(JSON.stringify(p), before);
  }
});

test("failed tag save retains the draft; successful save preserves categories and clears only the tag draft", () => {
  const p = fixturePlan(), original = JSON.stringify(p), before = { ...emptyTagDraft, name: "새 태그" }, h = manager(before, p);
  const submit = () => nodes(h.render()).find(n => n.type === "form").props.onSubmit({ preventDefault() {} });
  submit(); assert.deepEqual(h.value, before); assert.equal(h.sets.length, 0); assert.match(h.error, /입력은 초안/);
  h.allowSave(); submit(); assert.deepEqual(h.value, emptyTagDraft); assert.equal(h.sets.length, 1);
  assert.equal(h.saves.at(-1).tags.length, 2); assert.deepEqual(h.saves.at(-1).categories, p.categories);
  assert.equal(JSON.stringify(p), original);
});

test("tag edit and removal remain available and never reassign legacy categories", () => {
  const h = manager();
  nodes(h.render()).find(n => n.props?.["aria-label"] === "기존 태그 태그 수정").props.onClick();
  assert.equal(h.value.id, "tag");
  nodes(h.render()).find(n => n.type === "input" && n.props.value === "기존 태그").props.onChange({ target: { value: "바꾼 태그" } });
  h.allowSave(); nodes(h.render()).find(n => n.type === "form").props.onSubmit({ preventDefault() {} });
  assert.equal(h.saves.at(-1).tags[0].name, "바꾼 태그");
  assert.deepEqual(h.saves.at(-1).categories, fixturePlan().categories);
  const removing = manager(); removing.allowSave();
  nodes(removing.render()).find(n => n.props?.["aria-label"] === "기존 태그 태그 삭제").props.onClick();
  assert.deepEqual(removing.saves[0].tags, []); assert.deepEqual(removing.saves[0].categories, fixturePlan().categories);
});

test("filter, badge and editor never expose categories but keep tags visible", () => {
  const h = manager(), p = fixturePlan(), c = h.components;
  const filters = c.ClassificationFilters({ plan: p, value: { category: "category:cat", tags: [], search: "" }, onChange() {}, total: 2, count: 2 });
  assert(!text(filters).includes("카테고리"));
  assert(!nodes(filters).some(n => n.type === "select" && n.props.value === "category:cat"));
  const badges = c.ClassificationBadges({ plan: p, task: { categoryId: "cat", tagIds: ["tag"] }, showCategory: true });
  assert.equal(text(badges), "#기존 태그");
  const editor = c.TaskClassificationFields({ plan: p, categoryId: "cat", tagIds: ["tag"], onChange() {} });
  assert.equal(editor.type, c.TaskTagFields); assert(!("categoryId" in editor.props));
});

test("conflict backup/reset persists a tag draft and restores subsequent input after restart", () => {
  for (const tags of [[{ id: "tag", name: "외부에서 변경" }], []]) {
    const plan = { ...fixturePlan(), tags }, originalPlan = JSON.stringify(plan);
    const original = { ...emptyTagDraft, id: "tag", base: { id: "tag", name: "기존 태그" }, name: "보존할 편집 초안" };
    const h = manager(original, plan), legacyKey = draftKey("local", "classification"), legacyRaw = JSON.stringify({ untouched: "이전 카테고리 초안" });
    h.storage.setItem(legacyKey, legacyRaw);
    const button = nodes(h.render()).find(node => node.type === "button" && text(node) === "초안 백업 후 새로 작성");
    const before = h.storage.getItem(draftKey("local", "tag-management"));
    button.props.onClick();
    assert.equal(h.backups.length, 1); assert.equal(h.backups[0], before);
    assert.deepEqual(JSON.parse(h.backups[0]).data, original);
    assert.equal(h.value.kind, "tag"); assert.equal(h.value.id, null);
    h.restart(); assert.equal(h.value.kind, "tag"); assert.equal(h.value.name, "");
    nodes(h.render()).find(node => node.type === "input" && node.props.value === "").props.onChange({ target: { value: "재시작 후 유지할 태그" } });
    h.restart(); assert.equal(h.value.kind, "tag"); assert.equal(h.value.name, "재시작 후 유지할 태그");
    assert.equal(h.storage.getItem(legacyKey), legacyRaw); assert.equal(JSON.stringify(plan), originalPlan);
    assert.equal(h.saves.length, 0);
  }
});
