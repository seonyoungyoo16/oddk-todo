import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const element = (type, props) => ({ type, props });
function nodes(node) { return !node || typeof node !== "object" ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)]; }
function hooks() {
  const state = [], refs = [], effects = []; let stateIndex, refIndex;
  return { refs, effects, reset() { stateIndex = 0; refIndex = 0; },
    api: { useRef(initial) { return refs[refIndex++] ??= { current: initial }; },
      useState(initial) { const i = stateIndex++; if (!(i in state)) state[i] = initial; return [state[i], value => { state[i] = value; }]; },
      useEffect(fn) { effects.push(fn); }, useSyncExternalStore(_subscribe, snapshot) { return snapshot(); } } };
}
function load(file, dependencies, runtime) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL(`../../app/todo/${file}`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(source, { exports, HTMLElement: class {}, document: { activeElement: null }, require(name) {
    if (name === "react") return runtime.api;
    if (name === "react/jsx-runtime") return { jsx: element, jsxs: element };
    if (name === "react-icons/hi2") return {};
    if (name in dependencies) return dependencies[name];
    throw Error(name);
  } });
  return exports;
}

function settings(native = false) {
  const h = hooks(), calls = [];
  const exports = load("settings-panel.tsx", {
    "./classification-controls": { ClassificationManager: () => null },
    "./settings-events": { openSettingsDialog: mode => calls.push(mode) },
    "./sync-store": { getSyncSnapshot: () => JSON.stringify({ connected: false, phase: "local", message: "local" }), getServerSyncSnapshot() {}, subscribeSync() {}, exportPlanBackup() {} },
    "./account-help-links": { AccountHelpLinks: () => null },
    "./native-reminder-settings": { DeviceReminderSettings: () => null, useNativeReminderStatus: () => ({ native }) },
    "./ai-consent-controls": { AIConsentSettings: () => null },
  }, h);
  const render = () => { h.reset(); return exports.SettingsPanel({ plan: {}, onSave() {}, theme: "light", onThemeChange() {}, fallback: "", native }); };
  return { calls, render };
}

test("all four settings tabs preserve selection, roving focus and matching tabpanel relationships", () => {
  const h = settings(), ids = ["general", "classification", "account", "data"];
  for (const id of ids) {
    const button = nodes(h.render()).find(n => n.props?.id === `settings-tab-${id}`);
    button.props.onClick();
    const rendered = nodes(h.render());
    const selected = rendered.filter(n => n.props?.role === "tab" && n.props["aria-selected"]);
    assert.equal(selected.length, 1); assert.equal(selected[0].props.id, `settings-tab-${id}`); assert.equal(selected[0].props.tabIndex, 0);
    const visible = rendered.filter(n => n.props?.role === "tabpanel" && !n.props.hidden);
    assert.equal(visible.length, 1); assert.equal(visible[0].props.id, selected[0].props["aria-controls"]);
    assert.equal(visible[0].props["aria-labelledby"], selected[0].props.id);
  }
  assert.equal(h.calls.length, 0, "tab changes do not open auth, backup or settings side effects");
});

test("settings Arrow/Home/End navigation keeps the existing keyboard flow after the visual grid change", () => {
  const h = settings(); let focus = "";
  for (const button of nodes(h.render()).filter(n => n.props?.role === "tab")) button.props.ref({ focus() { focus = button.props.id; } });
  for (const [from, key, to] of [["general", "ArrowLeft", "data"], ["data", "Home", "general"], ["general", "End", "data"], ["data", "ArrowRight", "general"]]) {
    const button = nodes(h.render()).find(n => n.props?.id === `settings-tab-${from}`); let prevented = false;
    button.props.onKeyDown({ key, preventDefault() { prevented = true; } });
    assert(prevented); assert.equal(focus, `settings-tab-${to}`);
    assert(nodes(h.render()).find(n => n.props?.id === focus).props["aria-selected"]);
  }
});

test("native notification card has only its toggle content while the web title, explanation and four tabs remain", () => {
  for (const native of [true, false]) {
    const h = settings(native), tree = nodes(h.render());
    const panel = tree.find(n => n.props?.id === "settings-panel-data");
    const card = panel.props.children[0];
    assert.equal(card.props.title, native ? undefined : "일정 알림"); assert.equal(!!card.props.description, !native);
    assert.equal(nodes(card.type(card.props)).filter(n => n.type === "header").length, native ? 0 : 1);
    assert.equal(tree.filter(n => n.props?.role === "tab").length, 4);
  }
});

test("goal deletion opens with cancel focus, Escape cancels without confirming, and a failed confirmation remains visible", () => {
  const h = hooks(); let cancelled = 0, confirmed = 0, focused = 0, opened = 0;
  const exports = load("goal-delete-dialog.tsx", { "./ui/dialog-header": { DialogHeader: () => null }, "./dialog-focus": { keepFocusInDialog() {} } }, h);
  const render = () => { h.reset(); return exports.GoalDeleteDialog({ title: "긴 목표 원문을 보존하는 목표", dirty: true, onCancel() { cancelled++; }, onConfirm() { confirmed++; return "최신 내용을 확인해주세요."; } }); };
  let tree = render();
  h.refs[0].current = { showModal() { opened++; }, close() {} }; h.refs[1].current = { focus() { focused++; } };
  h.effects[0](); assert.equal(opened, 1); assert.equal(focused, 1);
  let prevented = false; tree.props.onCancel({ preventDefault() { prevented = true; } });
  assert(prevented); assert.equal(cancelled, 1); assert.equal(confirmed, 0);
  nodes(tree).find(n => n.type === "form").props.onSubmit({ preventDefault() {} });
  tree = render(); assert.equal(confirmed, 1); assert.equal(cancelled, 1);
  assert.equal(nodes(tree).find(n => n.props?.role === "alert").props.children, "최신 내용을 확인해주세요.");
  assert.equal(nodes(tree).find(n => n.props?.id === "goal-delete-title").props.title, "이 목표를 삭제할까요?");
});
