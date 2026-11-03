import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as execution from "../../supabase/functions/_shared/execution.ts";
import * as timer from "../../app/todo/execution-timer.ts";
import { selectDay } from "../../app/todo/day-selectors.ts";
import * as rest from "../../app/todo/rest-alert.ts";
import { createRestAlertStore } from "../../app/todo/rest-alert-store.ts";

const element = (type, props) => ({ type, props });
const nodes = node => !node || typeof node !== "object" ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
const text = node => typeof node === "string" || typeof node === "number" ? String(node) : node && typeof node === "object" ? [node.props?.children].flat(Infinity).map(text).join("") : "";

function panel() {
  const values = [], refs = [], effects = [], exports = {};
  const storage = new Map(), restAlertStore = createRestAlertStore(() => ({ getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) }));
  function RestAlertDialog() {}
  let cursor = 0, refCursor = 0;
  const code = ts.transpileModule(readFileSync(new URL("../../app/todo/execution-panel.tsx", import.meta.url), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { exports, Date, Intl, Set, performance: { now: () => 0 }, setInterval: () => 0, clearInterval() {}, require(name) {
    if (name === "react/jsx-runtime") return { jsx: element, jsxs: element };
    if (name === "react") return {
      useState(initial) { const i = cursor++; if (!(i in values)) values[i] = initial; return [values[i], value => { values[i] = value; }]; },
      useRef(initial) { const i = refCursor++; return refs[i] ??= { current: initial }; },
      useEffect(callback) { effects.push(callback); },
    };
    if (name.endsWith("_shared/execution")) return execution;
    if (name === "./execution-timer") return timer;
    if (name === "./day-selectors") return { selectDay };
    if (name === "./rest-alert") return rest;
    if (name === "./rest-alert-store") return { restAlertStore };
    if (name === "./use-rest-alert") return { useRestAlert: (scope, record) => rest.matchedRestAlert(scope, record, rest.parseRestAlert(restAlertStore.getSnapshot())) };
    if (name === "./rest-alert-dialog") return { RestAlertDialog };
    return {};
  } });
  return { restAlertStore, dialog: tree => nodes(tree).find(node => node.type === RestAlertDialog), render(props) { cursor = 0; refCursor = 0; effects.length = 0; const tree = exports.ExecutionPanel(props); for (const effect of effects) effect(); return tree; } };
}

test("the actual execution panel reflects a shorter plan without issuing pause/resume/reset commands", () => {
  const task = { id: "task", title: "작업", minutes: 30, bufferMinutes: 5, done: false, plannedDate: "2026-11-03" };
  const record = execution.startExecution(task, "00000000-0000-4000-8000-000000000125", "2026-11-03T00:00:00.000Z");
  const original = JSON.stringify(record), calls = [];
  const model = { state: { current: record, now: "2026-11-03T00:10:00.000Z" }, busy: false, pending: null, command: command => calls.push(command), suspendPolling() {} };
  const props = { compact: true, docked: true, scope: "local", date: "2026-11-03", plan: { tasks: [task] }, model, switchTask: null, onCancelSwitch() {} };
  const ui = panel();
  assert.match(text(ui.render(props)), /작업 남음 00:15:00/);
  const changed = { ...props, plan: { tasks: [{ ...task, minutes: 10 }] } };
  ui.render(changed);
  let tree = ui.render(changed);
  assert.match(text(tree), /작업 초과 00:05:00/);
  assert.equal(nodes(tree).filter(node => node.props?.role === "status" && text(node).includes("계획한 작업 시간이 지났어요")).length, 1);
  assert.equal(nodes(tree).find(node => node.props?.["aria-label"] === "누적 작업 시간").props.children, "00:10:00");
  tree = ui.render({ ...changed, model: { ...model, state: { ...model.state, current: execution.transitionExecution(record, "pause", model.state.now) } } });
  assert.match(text(tree), /일시정지/); assert.match(text(tree), /작업 초과 00:05:00/);
  assert.equal(JSON.stringify(record), original); assert.deepEqual(calls, []);
});

test("actual panel opens the rest chooser without a command, cancels without starting, and persists only after a confirmed break", async () => {
  const task = { id: "task", title: "작업", minutes: 30, bufferMinutes: 5, done: false, plannedDate: "2026-11-04" };
  const at = "2026-11-04T00:00:00.000Z", next = "2026-11-04T00:02:00.000Z";
  const record = execution.startExecution(task, "00000000-0000-4000-8000-000000000125", at), calls = [];
  let confirmed = false;
  const model = { state: { current: record, now: next }, busy: false, pending: null, async command(command) {
    calls.push(command); if (confirmed) this.state = { ...this.state, current: execution.transitionExecution(record, "break", next) }; return confirmed;
  }, suspendPolling() {} };
  const props = { compact: true, docked: true, scope: "local", date: "2026-11-04", plan: { tasks: [task] }, model, switchTask: null, onCancelSwitch() {} };
  const ui = panel();
  const open = () => nodes(ui.render(props)).find(node => node.type === "button" && text(node) === "휴식 시작").props.onClick();
  open(); let dialog = ui.dialog(ui.render(props));
  assert.equal(dialog.props.initialMinutes, 5); assert.deepEqual(calls, []); assert.equal(ui.restAlertStore.getSnapshot(), "");
  dialog.props.onClose(); assert.equal(ui.dialog(ui.render(props)), undefined); assert.deepEqual(calls, []);
  open(); dialog = ui.dialog(ui.render(props)); await dialog.props.onApply(10); ui.render(props);
  assert.equal(ui.restAlertStore.getSnapshot(), "", "failed/unknown break command cannot arm a local alert");
  confirmed = true; open(); dialog = ui.dialog(ui.render(props)); await dialog.props.onApply(10); ui.render(props);
  assert.equal(rest.parseRestAlert(ui.restAlertStore.getSnapshot()).minutes, 10);
  assert.equal(rest.parseRestAlert(ui.restAlertStore.getSnapshot()).segmentKey, rest.restAlertSegment(model.state.current).key);
  model.state.now = "2026-11-04T00:04:00.000Z";
  let tree = ui.render(props);
  assert.equal(nodes(tree).find(node => node.props?.["aria-label"] === "이번 휴식 시간").props.children, "00:02:00");
  nodes(tree).find(node => node.type === "button" && text(node) === "이번 휴식 알림 변경").props.onClick();
  dialog = ui.dialog(ui.render(props)); const before = JSON.stringify(model.state.current), count = calls.length;
  await dialog.props.onApply(0); tree = ui.render(props);
  assert.equal(calls.length, count); assert.equal(JSON.stringify(model.state.current), before);
  assert.equal(rest.parseRestAlert(ui.restAlertStore.getSnapshot()).minutes, null); assert.match(text(tree), /알림 없이 쉬기/);
});
