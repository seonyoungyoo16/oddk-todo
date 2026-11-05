import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { filterClassifiedTasks } from "../../app/todo/classification-actions.ts";
import { selectDay } from "../../app/todo/day-selectors.ts";
import { availabilitySummary } from "../../app/todo/availability.ts";
import * as dialogFocus from "../../app/todo/dialog-focus.ts";

const source = file => readFileSync(new URL(`../../app/todo/${file}`, import.meta.url), "utf8");
const node = (type, props) => ({ type, props });
const nodes = n => !n || typeof n !== "object" ? [] : [n, ...[n.props?.children].flat(Infinity).flatMap(nodes)];
const text = n => typeof n === "string" || typeof n === "number" ? String(n) : n && typeof n === "object" ? [n.props?.children].flat(Infinity).map(text).join("") : "";
function component(file) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, require(name) {
    if (name === "react/jsx-runtime") return { jsx: node, jsxs: node };
    if (name === "react") return { useState() {}, useRef: initial => ({ current: initial }), useId: () => "search-test" };
    if (name === "./dialog-focus") return dialogFocus;
    if (name.includes("taxonomy")) return { taskTagLimit: 10 };
    return {};
  } });
  return exports;
}
const task = (id, patch = {}) => ({ id, title: "개발 문서", notes: "리뷰", minutes: 60, bufferMinutes: 10, startTime: "09:00", endTime: "10:00", endDate: "2026-11-01", endDayOffset: 0, plannedDate: "2026-11-01", priority: "normal", done: false, categoryId: "work", tagIds: ["review", "dev"], ...patch });

test("status AND every tag AND search ignore legacy category while preserving records and order", () => {
  const tasks = [task("active"), task("done", { done: true }), task("other", { categoryId: "private" }), task("tag", { tagIds: ["dev"] }), task("search", { title: "운동", notes: "" }), task("summary", { summaryOnly: true })];
  const original = structuredClone(tasks), filter = { category: "category:work", tags: ["review", "dev"], search: "개발", status: "active" };
  assert.deepEqual(filterClassifiedTasks(tasks, filter).map(t => t.id), ["active", "other"]);
  assert.deepEqual(filterClassifiedTasks(tasks, { ...filter, status: "done" }).map(t => t.id), ["done"]);
  assert.deepEqual(filterClassifiedTasks(tasks, { ...filter, status: "all" }).map(t => t.id), ["active", "done", "other", "summary"]);
  assert.deepEqual(tasks, original);
});

test("hidden active events still occupy time and collide in original day calculations", () => {
  const tasks = [task("first"), task("hidden", { startTime: "09:30", endTime: "10:30" })];
  assert.deepEqual(filterClassifiedTasks(tasks, { category: "all", tags: [], search: "", status: "done" }), []);
  const day = availabilitySummary(selectDay(tasks, "2026-11-01"), { start: "09:00", end: "18:00", fixed: [] });
  assert.equal(day.occupiedMinutes, 90); assert.equal(day.freeMinutes, 450); assert.equal(day.overlapMinutes, 30);
});

test("shared status and header search retain each other, clear obsolete tags and can return to all tasks", () => {
  const { DailyPlanningControls } = component("daily-workspace-controls.tsx");
  const { TaskSearchControl } = component("task-search-control.tsx");
  const { defaultClassification } = component("classification-controls.tsx");
  let value = { category: "all", tags: ["dev"], search: "개발", status: "done" };
  const render = () => nodes(DailyPlanningControls({ value, onChange: next => { value = next; }, pane: "list", onPaneChange() {}, range: "day" }));
  const search = () => nodes(TaskSearchControl({ value: value.search, onChange: query => { value = { ...value, tags: [], search: query }; } }));
  const select = render().find(n => n.type === "select" && n.props.value === "done");
  assert.deepEqual(nodes(select).filter(n => n.type === "option").map(text), ["전체", "진행 중", "완료"]);
  select.props.onChange({ target: { value: "active" } });
  assert.equal(value.category, "all"); assert.equal(value.search, "개발"); assert.equal(value.tags.length, 0); assert.equal(value.status, "active");
  search().find(n => n.type === "input").props.onChange({ target: { value: "리뷰" } });
  assert.equal(value.search, "리뷰"); assert.equal(value.status, "active");
  search().find(n => n.type === "button" && text(n) === "검색어 지우기").props.onClick();
  assert.equal(value.search, ""); assert.equal(value.status, "active");
  render().find(n => n.type === "select").props.onChange({ target: { value: "all" } });
  assert.equal(JSON.stringify(value), JSON.stringify(defaultClassification));
});

test("one/two/twenty-row bodies expose a keyboard region without including filters or composer", () => {
  const { TaskListBody } = component("task-list-body.tsx");
  for (const count of [1, 2, 20]) {
    const tree = TaskListBody({ children: Array.from({ length: count }, (_, id) => node("li", { children: String(id) })) });
    assert.equal(tree.props.role, "region"); assert.equal(tree.props.tabIndex, 0);
    assert.equal(nodes(tree).filter(n => n.type === "li").length, count);
    assert(!nodes(tree).some(n => n.type === "form" || n.type === "select"));
  }
  const css = source("task-list-scroll.css");
  assert.match(css, /max-height:min\(55dvh,640px\)/); assert.match(css, /overflow-y:auto/);
  assert.doesNotMatch(css.slice(css.indexOf("{"), css.indexOf("}")), /(?:^|[;{\s])(?:height|min-height):/);
  assert.match(css, /scroll-padding-block/); assert.match(css, /overflow-x:hidden/);
});

test("page uses one shared status control and timetable filter, preserving full plan for calculations", () => {
  const page = source("page.tsx");
  assert.match(page, /currentFilters = \{ \.\.\.classification, category: "all" as const, status: filter \}/);
  assert.match(page, /DailyPlanningControls value=\{currentFilters\}/);
  assert.match(page, /setClassification\(\{ \.\.\.next, category: "all", tags: \[\], status: "all" \}\); setFilter\(next.status \?\? "all"\)/);
  assert.match(page, /tasks=\{filterClassifiedTasks\(plan.tasks, currentFilters\)\}/);
  assert.match(page, /const day = selectDay\(plan.tasks, planDate\)/);
  assert.doesNotMatch(page, /className="oddk-listTabs"/);
  assert.match(page, /setClassification\(defaultClassification\); setFilter\("all"\)/);
  assert.match(page, /<TaskListBody>/);
});
