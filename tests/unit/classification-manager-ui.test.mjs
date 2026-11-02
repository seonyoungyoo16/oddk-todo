import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as actions from "../../app/todo/classification-actions.ts";
import { emptyClassificationDraft } from "../../app/todo/classification-draft.ts";
import { sameValue } from "../../app/todo/json-equality.ts";

const element = (type, props) => ({ type, props });
function nodes(n) { return !n || typeof n !== "object" ? [] : [n, ...[n.props?.children].flat(Infinity).flatMap(nodes)]; }
function text(n) { return typeof n === "string" || typeof n === "number" ? String(n) : n && typeof n === "object" ? [n.props?.children].flat(Infinity).map(text).join("") : ""; }
const fixturePlan = () => ({ schemaVersion: 5, start: "09:00", reviewsByDate: {}, goalTree: { goal: "kept", groups: [] }, tasks: [], categories: [{ id: "cat", name: "기존 분류", color: "#4778c8" }], tags: [{ id: "tag", name: "기존 태그" }] });
function manager(initial = emptyClassificationDraft, plan = fixturePlan()) {
  let value = structuredClone(initial), error = "", allowSave = false;
  const sets = [], saves = [], exports = {};
  const draft = { get value() { return value; }, set(next) { value = structuredClone(next); sets.push(next); }, download() {} };
  const code = ts.transpileModule(readFileSync(new URL("../../app/todo/classification-controls.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { exports, crypto: { randomUUID: () => "new-category" }, Error, require(name) {
    if (name === "react") return { useState: () => [error, next => { error = next; }] };
    if (name === "react/jsx-runtime") return { jsx: element, jsxs: element };
    if (name === "react-icons/hi2") return {};
    if (name.includes("_shared/taxonomy")) return { taskTagLimit: 10 };
    if (name === "./classification-actions") return actions;
    if (name === "./classification-draft") return { emptyClassificationDraft };
    if (name === "./use-local-draft") return { useLocalDraft: () => draft, DraftFeedback: () => null };
    if (name === "./json-equality") return { sameValue };
    throw Error(name);
  } });
  return { sets, saves, get value() { return value; }, get error() { return error; }, allowSave() { allowSave = true; },
    render() { return exports.ClassificationManager({ plan, initiallyOpen: true, onSave(next) { saves.push(next); return allowSave; } }); } };
}

test("removing draft cancel and the policy paragraph does not clear any current input; counts are separate from headings", () => {
  const before = { ...emptyClassificationDraft, name: "작성 중인 분류" }, h = manager(before);
  for (let i = 0; i < 2; i++) {
    const tree = h.render(), all = nodes(tree);
    assert(!text(tree).includes("카테고리는 할 일당 하나, 태그는 여러 개 연결해요. 분류를 삭제해도 할 일은 남아요."));
    assert(!all.some(n => n.type === "button" && text(n) === "초안 취소"));
    assert.deepEqual(all.filter(n => n.type === "h3").map(text), ["카테고리", "태그"]);
    assert.deepEqual(all.filter(n => n.props?.className === "oddk-definitionLimit").map(text), ["1/30", "1/100"]);
    assert.deepEqual(h.value, before); assert.equal(h.sets.length, 0);
  }
});

test("failed save still retains the draft and successful save keeps the existing clear-after-save policy", () => {
  const p = fixturePlan(), original = JSON.stringify(p), before = { ...emptyClassificationDraft, name: "새 분류" }, h = manager(before, p);
  const submit = () => nodes(h.render()).find(n => n.type === "form").props.onSubmit({ preventDefault() {} });
  submit(); assert.deepEqual(h.value, before); assert.equal(h.sets.length, 0); assert.match(h.error, /입력은 초안/);
  h.allowSave(); submit(); assert.deepEqual(h.value, emptyClassificationDraft); assert.equal(h.sets.length, 1);
  assert.equal(h.saves.at(-1).categories.length, 2); assert.equal(JSON.stringify(p), original);
});

test("category editing and empty-list limits remain available without adding an automatic cancel action", () => {
  const h = manager();
  nodes(h.render()).find(n => n.props?.["aria-label"] === "기존 분류 카테고리 수정").props.onClick();
  assert.equal(h.value.id, "cat"); assert.equal(h.value.name, "기존 분류");
  const form = nodes(h.render()).find(n => n.type === "form");
  nodes(form).find(n => n.type === "input" && n.props?.value === "기존 분류").props.onChange({ target: { value: "바꾼 분류" } });
  h.allowSave(); nodes(h.render()).find(n => n.type === "form").props.onSubmit({ preventDefault() {} });
  assert.equal(h.saves.at(-1).categories[0].name, "바꾼 분류");
  const empty = manager(emptyClassificationDraft, { ...fixturePlan(), categories: [], tags: [] });
  assert.deepEqual(nodes(empty.render()).filter(n => n.props?.className === "oddk-definitionLimit").map(text), ["0/30", "0/100"]);
});
