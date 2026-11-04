import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { isPlanDate } from "../../supabase/functions/_shared/plan.ts";
import { dayLabel, weekDates } from "../../app/todo/calendar-range.ts";
import { activityHoursValue } from "../../app/todo/activity-hours-model.ts";
import { sameValue } from "../../app/todo/json-equality.ts";
import * as dialogFocus from "../../app/todo/dialog-focus.ts";

const element = (type, props) => ({ type, props });
const nodes = n => !n || typeof n !== "object" ? [] : [n, ...[n.props?.children].flat(Infinity).flatMap(nodes)];
const text = n => typeof n === "string" || typeof n === "number" ? String(n) : n && typeof n === "object" ? [n.props?.children].flat(Infinity).map(text).join("") : "";
const defaults = { category: "all", tags: [], search: "", status: "all" };
function load(file, hooks = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(`../../app/todo/${file}`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { exports, require(name) {
    if (name === "react/jsx-runtime") return { jsx: element, jsxs: element };
    if (name === "react") return hooks;
    if (name.includes("_shared/plan")) return { isPlanDate };
    if (name === "./calendar-range") return { dayLabel, weekDates };
    if (name === "./classification-controls") return { ClassificationFilters: "ClassificationFilters", defaultClassification: defaults };
    if (name === "./activity-hours-model") return { activityHoursValue };
    if (name === "./json-equality") return { sameValue };
    if (name === "./ui/dialog-header") return { DialogHeader: "DialogHeader" };
    if (name === "./dialog-focus") return dialogFocus;
    return {};
  } });
  return exports;
}
const { DailyDateControl, DailyPlanningControls } = load("daily-workspace-controls.tsx");

test("one status control preserves detailed AND filters and collapsed conditions remain outside the popup", () => {
  const plan = { categories: [{ id: "work", name: "업무" }], tags: [{ id: "tag", name: "검토" }] }, original = structuredClone(plan);
  let value = { category: "category:work", tags: ["tag"], search: "중요", status: "active" }, pane = "list";
  const render = () => DailyPlanningControls({ plan, value, onChange: next => { value = next; }, count: 2, total: 20, pane, onPaneChange: next => { pane = next; }, range: "day" });
  let all = nodes(render());
  const select = all.filter(n => n.type === "select"); assert.equal(select.length, 1);
  select[0].props.onChange({ target: { value: "done" } });
  assert.equal(value.category, "category:work"); assert.equal(value.tags[0], "tag"); assert.equal(value.search, "중요"); assert.equal(value.status, "done");
  all = nodes(render());
  const applied = all.find(n => n.props?.className === "oddk-appliedFilters");
  assert.match(text(applied), /20개 중 2개.*#검토.*검색: 중요.*완료/);
  assert.doesNotMatch(text(applied), /업무|카테고리/);
  const popup = all.find(n => n.type === "details"); assert(!nodes(popup).includes(applied));
  assert.equal(all.find(n => n.type === "ClassificationFilters").props.showStatus, false);
  all.find(n => n.type === "button" && text(n) === "초기화").props.onClick(); assert.equal(value, defaults);
  assert.deepEqual(plan, original);
});

test("view switching changes only the requested pane and preserves filter values", () => {
  const value = { ...defaults, tags: ["t"], search: "draft" }; let pane = "list";
  const tree = DailyPlanningControls({ plan: {}, value, onChange() { throw Error("must not change filters"); }, count: 1, total: 8, pane, onPaneChange: next => { pane = next; }, range: "day" });
  nodes(tree).find(n => n.type === "button" && text(n) === "시간표").props.onClick();
  assert.equal(pane, "rhythm"); assert.equal(value.search, "draft"); assert.equal(value.tags[0], "t");
});

test("date and day/week/all range use real selected values and fixed native-today has no conflicting date picker", () => {
  const changes = [], props = { date: "2026-11-02", today: "2026-11-03", range: "week", onChange: (...args) => changes.push(args) };
  const all = nodes(DailyDateControl(props));
  all.find(n => n.type === "input").props.onChange({ target: { value: "2026-11-09" } });
  assert.deepEqual(changes.at(-1), ["2026-11-09", "week"]);
  all.find(n => n.type === "input").props.onChange({ target: { value: "" } }); assert.equal(changes.length, 1);
  all.find(n => n.type === "select").props.onChange({ target: { value: "all" } }); assert.deepEqual(changes.at(-1), ["2026-11-02", "all"]);
  all.find(n => n.type === "button").props.onClick(); assert.deepEqual(changes.at(-1), ["2026-11-03", "day"]);
  const native = DailyDateControl({ ...props, fixed: true });
  assert.match(native.props["aria-label"], /오늘 시간표/); assert.equal(nodes(native).filter(n => ["input", "select", "details"].includes(n.type)).length, 0);
});

test("activity-hours dialog is outside closed planning tools and still saves via the existing conflict-aware callback", () => {
  const states = [], refs = []; let s = 0, r = 0; const calls = [];
  const hooks = { useState(initial) { const i = s++; if (!(i in states)) states[i] = initial; return [states[i], next => { states[i] = next; }]; }, useRef(initial) { return refs[r++] ??= { current: initial }; } };
  const { ActivityHours } = load("activity-hours.tsx", hooks), saved = { start: "09:00", end: "18:00", fixed: [] };
  const render = () => { s = 0; r = 0; return ActivityHours({ inTools: true, date: "2026-11-02", saved, onSave(next, expected) { calls.push({ next, expected }); return true; } }); };
  let all = nodes(render()); refs[0].current = { showModal() { calls.push("open"); }, close() { calls.push("close"); } }; refs[1].current = { focus() {} }; refs[2].current = { focus() {} };
  const tools = all.find(n => n.type === "details"), dialog = all.find(n => n.type === "dialog");
  assert(dialog); assert(!nodes(tools).includes(dialog));
  nodes(tools).find(n => n.type === "button").props.onClick();
  assert.equal(calls[0], "open"); all = nodes(render());
  all.find(n => n.type === "form").props.onSubmit({ preventDefault() {} });
  assert.deepEqual(calls[1].next, saved); assert.equal(calls[1].expected, saved); assert.equal(calls[2], "close");
});

test("row checkbox labels stop the parent row click so a native label activation cannot select twice", () => {
  const file = ts.createSourceFile("page.tsx", readFileSync(new URL("../../app/todo/page.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = file.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === "SelectionCheckbox");
  assert(declaration);
  const code = ts.transpileModule(declaration.getText(file) + "\nexports.checkbox = SelectionCheckbox;", { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, useRef: () => ({ current: null }), useEffect() {}, require: () => ({ jsx: element, jsxs: element }) });
  let changes = 0, stopped = 0;
  const label = exports.checkbox({ label: "할 일 선택", checked: false, onChange() { changes++; } });
  label.props.onClick({ stopPropagation() { stopped++; } });
  nodes(label).find(n => n.type === "input").props.onChange();
  assert.equal(stopped, 1); assert.equal(changes, 1);
});

test("AI save callback never focuses the source field before the dialog's single trigger-focus cleanup", () => {
  const file = ts.createSourceFile("page.tsx", readFileSync(new URL("../../app/todo/page.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback;
  const visit = node => { if (ts.isFunctionDeclaration(node) && node.name?.text === "addSplitTasks") callback = node; ts.forEachChild(node, visit); };
  visit(file); assert(callback);
  assert.doesNotMatch(callback.getText(file), /\.focus\(/);
  assert.match(callback.getText(file), /if \(!save\(/);
  assert.match(callback.getText(file), /setInput\(""\)/);
});
