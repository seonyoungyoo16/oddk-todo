import * as dialogFocus from "../../app/todo/dialog-focus.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import postcss from "postcss";
import * as goals from "../../app/todo/goal-boards.ts";
import * as drafts from "../../app/todo/goal-draft.ts";
import { sameValue } from "../../app/todo/json-equality.ts";

const element = (type, props) => ({ type, props });
const nodes = n => !n || typeof n !== "object" ? [] : [n, ...[n.props?.children].flat(Infinity).flatMap(nodes)];
const text = n => typeof n === "string" || typeof n === "number" ? String(n) : n && typeof n === "object" ? [n.props?.children].flat(Infinity).map(text).join("") : "";
const source = file => readFileSync(new URL(`../../app/todo/${file}`, import.meta.url), "utf8");
function hooks(compact = true) {
  const values = [], refs = [], effects = []; let state = 0, ref = 0;
  return { refs, effects, reset() { state = 0; ref = 0; effects.length = 0; }, api: {
    useState(initial) { const i = state++; if (!(i in values)) values[i] = initial; return [values[i], next => { values[i] = typeof next === "function" ? next(values[i]) : next; }]; },
    useRef(initial) { return refs[ref++] ??= { current: initial }; }, useMemo(fn) { return fn(); },
    useEffect(fn) { effects.push(fn); }, useId() { return "goal-test"; }, useSyncExternalStore() { return compact; },
  } };
}
function load(file, runtime, dependencies = {}, extra = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, crypto: { randomUUID: () => "new-goal" }, requestAnimationFrame: fn => { fn(); return 1; }, cancelAnimationFrame() {},
    HTMLElement: class {}, document: { activeElement: null }, ...extra,
    require(name) {
      if (name === "react") return runtime.api;
      if (name === "react/jsx-runtime") return { jsx: element, jsxs: element };
      if (name === "react-icons/hi2") return {};
      if (name === "./ui/back-button") return load("ui/back-button.tsx", runtime);
      if (name in dependencies) return dependencies[name];
      throw Error(name);
    },
  }); return exports;
}
const task = (id, done = false) => ({ id, title: id + " 원문", done, notes: "보존", plannedDate: null, startTime: null, minutes: null, bufferMinutes: null, endTime: null, endDate: null, endDayOffset: null, priority: "normal" });
function plan() {
  let p = { schemaVersion: 5, tasks: [task("linked", true), task("free")], start: "09:00", reviewsByDate: {}, goalTree: { goal: "첫 목표", groups: [{ id: "first-area", title: "첫 세부목표", taskIds: ["linked"] }] } };
  p = goals.addGoalBoard(p, "second");
  const board = drafts.goalBoard(goals.goalBoardTree(p, "second")); board.goal = "두 번째 목표"; board.areas[0].title = "두 번째 세부목표";
  return goals.saveGoalBoard(p, "second", goals.editGoalBoardDraft(p, "second", board));
}
function dirtyDraft(p, id, title) {
  const meta = goals.planGoalBoards(p).find(b => b.id === id), board = structuredClone(drafts.goalBoard(goals.goalBoardTree(p, id), meta.layout));
  board.goal = title; return goals.editGoalBoardDraft(p, id, board);
}
function goalsUI(initial = plan(), localValue) {
  let current = initial, deletionError = "";
  const h = hooks(), sets = [], deletions = [], adds = [];
  const local = { value: localValue ?? { selectedId: "second", drafts: {} }, hydrated: true, problem: null,
    set(next) { this.value = typeof next === "function" ? next(this.value) : next; sets.push(this.value); return true; } };
  const legacy = { value: null, hydrated: true, problem: null, set(next) { this.value = next; } };
  const View = () => null, Menu = () => null, Delete = () => null;
  const exports = load("goal-tree-view.tsx", h, {
    "./goal-draft": drafts, "./goal-boards": goals, "./json-equality": { sameValue },
    "./use-local-draft": { useLocalDraft: key => key === "goal-boards" ? local : legacy, DraftFeedback: () => null },
    "./planning-views": { MandalaView: View, GoalManagementMenu: Menu }, "./goal-delete-dialog": { GoalDeleteDialog: Delete },
  });
  const render = () => { h.reset(); return exports.GoalTreeView({ plan: current, ready: true, onSave() {}, onEdit() {},
    onAdd(id) { adds.push(id); current = goals.addGoalBoard(current, id); return null; },
    onDelete(snapshot) { deletions.push(snapshot); if (deletionError) return deletionError; current = goals.deleteGoalBoard(current, snapshot); return null; },
  }); };
  return { local, legacy, sets, deletions, adds, render, View, Menu, Delete, get plan() { return current; }, failDelete(message) { deletionError = message; } };
}
function mandalaUI(initial, compact = true) {
  const h = hooks(compact), changes = [], edits = []; let board = initial;
  const exports = load("planning-views.tsx", h, { "./auto-textarea": { AutoTextarea: "textarea" }, "./task-order": {}, "../../supabase/functions/_shared/plan": {}, "./dialog-focus": dialogFocus });
  const render = () => { h.reset(); return exports.MandalaView({ tasks: [task("linked", true), task("free")], draft: board,
    onChange(value) { changes.push(value); board = value; }, onEdit(value) { edits.push(value); }, management: element("button", { children: "목표 삭제" }) }); };
  return { ...h, exports, render, changes, edits, get board() { return board; } };
}

test("goal selection preserves pending drafts while new-goal stays blocked until they are saved", () => {
  const p = plan(), value = { selectedId: "default", drafts: { default: dirtyDraft(p, "default", "작성 중 첫 목표"), second: dirtyDraft(p, "second", "작성 중 둘째") } };
  const original = JSON.stringify(value.drafts), h = goalsUI(p, structuredClone(value));
  let view = nodes(h.render()).find(n => n.type === h.View), fields = nodes(view.props.toolbar);
  const select = fields.find(n => n.type === "select"); select.props.onChange({ target: { value: "second" } });
  view = nodes(h.render()).find(n => n.type === h.View); assert.equal(view.props.draft.goal, "작성 중 둘째");
  fields = nodes(view.props.toolbar); assert.equal(text(fields.find(n => n.props?.className === "oddk-goalAdd")), "새 목표");
  assert(!fields.some(n => n.props?.className === "oddk-goalDelete"));
  fields.find(n => n.props?.className === "oddk-goalAdd").props.onClick();
  assert.deepEqual(h.adds, []); assert.equal(h.local.value.selectedId, "second");
  assert.equal(fields.find(n => n.props?.className === "oddk-goalAdd").props.disabled, true);
  assert.equal(JSON.stringify(h.local.value.drafts), original); assert.equal(h.plan.tasks, p.tasks);
});

const addButton = h => { const root = h.render(), view = nodes(root).find(n => n.type === h.View); return nodes(view ? view.props.toolbar : root).find(n => n.props?.className === "oddk-goalAdd"); };

test("any stored or non-selected draft with an empty core blocks both new-goal UI and its handler without clearing drafts", () => {
  const p = plan(), values = { selectedId: "default", drafts: { second: dirtyDraft(p, "second", "   ") } };
  const h = goalsUI(p, structuredClone(values)), before = JSON.stringify(h.local.value);
  const button = addButton(h); assert.equal(button.props.disabled, true); button.props.onClick();
  assert.deepEqual(h.adds, []); assert.equal(JSON.stringify(h.local.value), before);
  const stored = plan(); stored.goalBoards[1].goal = " ";
  const blank = goalsUI(stored, { selectedId: "default", drafts: {} });
  assert.equal(addButton(blank).props.disabled, true); addButton(blank).props.onClick(); assert.deepEqual(blank.adds, []);
});

test("stale clean blank caches yield to newer saved goals without blocking addition or erasing local and legacy backups", () => {
  for (const source of ["local", "legacy"]) {
    const p = plan(), id = source === "local" ? "second" : "default", stale = dirtyDraft(p, id, "");
    stale.base = structuredClone(stale.value); stale.baseBoard = structuredClone(stale.board);
    assert.equal(goals.goalDraftChanged(stale), false); assert.equal(goals.goalDraftConflict(p, id, stale), true);
    const h = goalsUI(p, { selectedId: id, drafts: source === "local" ? { [id]: stale } : {} });
    if (source === "legacy") h.legacy.value = stale;
    const before = JSON.stringify({ drafts: h.local.value.drafts, legacy: h.legacy.value });
    const view = nodes(h.render()).find(n => n.type === h.View);
    assert.equal(view.props.draft.goal, goals.goalBoardTree(p, id).goal);
    const button = addButton(h); assert.equal(button.props.disabled, false); button.props.onClick();
    assert.equal(h.adds.length, 1); assert.equal(goals.goalBoardTree(h.plan, id).goal, goals.goalBoardTree(p, id).goal);
    assert.equal(JSON.stringify({ drafts: h.local.value.drafts, legacy: h.legacy.value }), before);
    assert.equal(h.plan.tasks, p.tasks);
  }
});

test("a non-selected dirty blank draft still blocks addition when it conflicts with the saved goal", () => {
  const p = plan(), draft = dirtyDraft(p, "second", "   "); draft.base.goal = "이전 저장 목표";
  assert.equal(goals.goalDraftChanged(draft), true); assert.equal(goals.goalDraftConflict(p, "second", draft), true);
  const h = goalsUI(p, { selectedId: "default", drafts: { second: draft } }), before = JSON.stringify(h.local.value);
  const button = addButton(h); assert.equal(button.props.disabled, true); button.props.onClick();
  assert.deepEqual(h.adds, []); assert.equal(JSON.stringify(h.local.value), before); assert.equal(h.plan.tasks, p.tasks);
});

test("first empty board is allowed, named settled boards permit one addition, and repeat clicks cannot add another", () => {
  const initial = { schemaVersion: 5, start: "09:00", tasks: [], reviewsByDate: {}, goalTree: { goal: "", groups: [] } };
  const first = goalsUI(initial, { selectedId: null, drafts: {} });
  assert.equal(addButton(first).props.disabled, false); addButton(first).props.onClick();
  assert.equal(first.adds.length, 1); assert.equal(addButton(first).props.disabled, true);
  const settled = goalsUI(plan(), { selectedId: "default", drafts: {} }), button = addButton(settled);
  assert.equal(button.props.disabled, false); button.props.onClick(); button.props.onClick();
  assert.equal(settled.adds.length, 1);
});

test("management deletion keeps confirmation target and drafts on cancel/failure, then deletes only selected draft", () => {
  const p = plan(), first = dirtyDraft(p, "default", "첫 초안"), second = dirtyDraft(p, "second", "둘째 초안");
  const h = goalsUI(p, { selectedId: "second", drafts: { default: first, second } }), original = JSON.stringify(h.local.value);
  const clickDelete = () => nodes(h.render()).find(n => n.type === h.View).props.management.props.onClick();
  clickDelete(); let dialog = nodes(h.render()).find(n => n.type === h.Delete);
  assert.equal(dialog.props.title, "둘째 초안"); assert.equal(dialog.props.dirty, true);
  dialog.props.onCancel(); assert.equal(JSON.stringify(h.local.value), original); assert.equal(h.deletions.length, 0);
  clickDelete(); h.failDelete("원본이 바뀌었어요"); dialog = nodes(h.render()).find(n => n.type === h.Delete);
  assert.equal(dialog.props.onConfirm(), "원본이 바뀌었어요"); assert.equal(h.deletions[0].id, "second");
  assert.equal(JSON.stringify(h.local.value), original); assert(nodes(h.render()).some(n => n.type === h.Delete));
  h.failDelete(""); assert.equal(dialog.props.onConfirm(), null);
  assert.equal(h.local.value.selectedId, "default"); assert.equal(h.local.value.drafts.second, undefined);
  assert.equal(JSON.stringify(h.local.value.drafts.default), JSON.stringify(first)); assert.equal(h.plan.tasks, p.tasks);
  assert.equal(goals.planGoalBoards(h.plan).length, 1);
});

test("oversize fallback retains the selected goal deletion and renders confirmation outside its management menu", () => {
  const p = plan(); p.goalTree.groups = Array.from({ length: 9 }, (_, i) => ({ id: `oversize-${i}`, title: String(i), taskIds: [] })); delete p.goalBoards;
  const h = goalsUI(p, { selectedId: "default", drafts: {} }), tree = h.render();
  assert(!nodes(tree).some(n => n.type === h.View));
  const menu = nodes(tree).find(n => n.type === h.Menu); assert(menu);
  menu.props.children.props.onClick(); const next = h.render(), dialog = nodes(next).find(n => n.type === h.Delete);
  assert(dialog); assert(!nodes(nodes(next).find(n => n.type === h.Menu)).includes(dialog));
  dialog.props.onCancel(); assert.equal(h.deletions.length, 0); assert.equal(h.local.value.selectedId, "default");
});

test("management closes and focuses its summary before reset opens, and resetting requires the existing confirmation submit", () => {
  const board = drafts.goalBoard(goals.goalBoardTree(plan(), "default")), original = JSON.stringify(board), h = mandalaUI(board), events = [];
  let tree = h.render(); h.refs[0].current = { showModal() { events.push("show"); }, close() { events.push("close"); } };
  tree = h.render(); const component = nodes(tree).find(n => n.type === h.exports.GoalManagementMenu), menu = h.exports.GoalManagementMenu(component.props);
  const details = { open: true, querySelector: () => ({ focus() { events.push("summary-focus"); } }) };
  menu.props.onClickCapture({ target: { closest: () => ({}) }, currentTarget: details });
  nodes(menu).find(n => n.props?.["aria-label"] === "현재 목표 전체초기화").props.onClick();
  assert.deepEqual(events, ["summary-focus", "show"]); assert.equal(details.open, false); assert.equal(h.changes.length, 0);
  const dialog = nodes(tree).find(n => n.type === "dialog" && n.props["aria-labelledby"] === "mandala-reset-title");
  nodes(dialog).find(n => n.type === "button" && text(n) === "취소").props.onClick(); assert.equal(h.changes.length, 0);
  nodes(dialog).find(n => n.type === "form").props.onSubmit({ preventDefault() {} });
  assert.equal(h.changes.length, 1); assert.equal(h.board.goal, ""); assert(h.board.areas.every(a => !a.title && a.taskIds.every(id => !id)));
  assert.equal(JSON.stringify(board), original); assert(!nodes(menu).some(n => n.type === "dialog"));
});

test("compact overview displays the goal only in its center and retains area heading/back/edit/unlink actions", () => {
  const board = drafts.goalBoard(goals.goalBoardTree(plan(), "default")), original = JSON.stringify(board), h = mandalaUI(board);
  let tree = h.render(), grid = nodes(tree).find(n => n.props?.className === "oddk-mandalaCompactGrid");
  assert.equal(grid.props.children.length, 9); assert.equal(nodes(tree).filter(n => n.type === "strong" && text(n) === board.goal).length, 1);
  assert.equal(nodes(tree).find(n => n.type === "h3").props.className, "oddk-srOnly");
  nodes(grid).find(n => n.type === "button" && n.props["aria-label"]?.includes("첫 세부목표 실행 보기")).props.onClick();
  tree = h.render(); assert.equal(nodes(tree).find(n => n.type === "h3").props.children, "첫 세부목표");
  const edit = nodes(tree).find(n => n.props?.className === "oddk-mandalaTask"); edit.props.onClick(); assert.equal(h.edits[0].id, "linked");
  nodes(tree).find(n => n.props?.className === "oddk-mandalaUnlink").props.onClick(); assert.equal(h.board.areas[0].taskIds[0], "");
  const backComponent = nodes(h.render()).find(n => n.props?.label === "핵심목표로 돌아가기");
  const back = backComponent.type(backComponent.props);
  assert.equal(back.props["aria-label"], "핵심목표로 돌아가기"); assert.equal(back.props.title, back.props["aria-label"]);
  back.props.onClick();
  assert.equal(nodes(h.render()).find(n => n.props?.className === "oddk-mandalaCompactGrid").props["data-level"], "overview");
  assert.equal(JSON.stringify(board), original);
});

test("desktop retains all nine groups and 81 positions, while a first empty compact goal keeps its guidance", () => {
  const board = drafts.goalBoard(goals.goalBoardTree(plan(), "default")), desktop = mandalaUI(board, false);
  const tree = desktop.render(), full = nodes(tree).find(n => n.props?.className === "oddk-mandalaBoard");
  assert.equal(full.props.children.length, 9); assert.equal(full.props.children.reduce((count, group) => count + group.props.children.length, 0), 81);
  assert.equal(nodes(tree).filter(n => n.type === "dialog").length, 2);
  const empty = structuredClone(board); empty.goal = ""; const compact = mandalaUI(empty).render();
  assert(nodes(compact).some(n => n.type === "p" && text(n).includes("핵심목표를 입력하면")));
  const grid = nodes(compact).find(n => n.props?.className === "oddk-mandalaCompactGrid");
  assert.equal(grid.props.children.filter(n => n.props.disabled === true).length, 8);
});

test("goal completion remains color-only and management dialog styling stays scoped to goals", () => {
  const css = postcss.parse(source("mandala-planner.css")); let completion;
  css.walkRules('.oddk-page .oddk-mandalaGoals .oddk-mandalaCanvas .oddk-mandalaCell[data-done="true"] .oddk-mandalaTask > span', rule => { completion = Object.fromEntries(rule.nodes.map(n => [n.prop, n.value])); });
  assert.deepEqual(completion, { "text-decoration": "none" });
});
