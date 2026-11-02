import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const code = ts.transpileModule(readFileSync(new URL("../../app/todo/native-reminder-settings.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
function render(patch = {}, actions = {}) {
  const state = { native: true, available: true, enabled: false, permission: "granted", phase: "ready", cleanupPending: false, error: "", ...patch };
  const counts = { on: 0, off: 0 }; let id = 0;
  const api = { getNativeReminderSnapshot: () => JSON.stringify(state), subscribeNativeReminders: () => () => {}, getServerReminderSnapshot: () => JSON.stringify(state), enableNativeReminders: async () => { counts.on++; await actions.on?.(); }, disableNativeReminders: async () => { counts.off++; await actions.off?.(); } };
  const exports = {};
  vm.runInNewContext(code, { exports, JSON, Error, require: name => {
    if (name === "react") return { useId: () => `id-${id++}`, useRef: value => ({ current: value }), useState: value => [value, () => {}], useSyncExternalStore: (_subscribe, get) => get() };
    if (name === "react/jsx-runtime") return require(name);
    if (name === "./native-reminders") return api;
    throw Error(`Unexpected import ${name}`);
  } });
  const tree = exports.DeviceReminderSettings({ children: "existing-web-controls" });
  function elements(value) {
    if (!value || typeof value !== "object") return [];
    if (Array.isArray(value)) return value.flatMap(elements);
    return [value, ...elements(value.props?.children)];
  }
  const nodes = elements(tree);
  return { tree, nodes, button: nodes.find(n => n.props?.role === "switch"), counts };
}
test("shared reminder control is one named switch without permanent explanatory/buttons UI", () => {
  const h = render();
  assert.equal(h.nodes.filter(n => n.type === "button").length, 1);
  assert.equal(h.nodes.find(n => n.props?.id === h.button.props["aria-labelledby"]).props.children, "기기 알림");
  assert.equal(h.button.props["aria-checked"], false);
  assert.equal(h.nodes.some(n => n.type === "small" || n.type === "p"), false);
});
test("checking/mutation and unsupported shells cannot expose an active switch", () => {
  for (const state of [{ phase: "checking" }, { phase: "changing" }, { available: false }]) assert.equal(render(state).button.props.disabled, true);
  for (const state of [{ enabled: true, permission: "denied" }, { enabled: true, phase: "error", error: "권한을 확인해주세요." }]) assert.equal(render(state).button.props["aria-checked"], false);
  assert.equal(render({ enabled: true }).button.props["aria-checked"], true);
  assert.equal(render({ native: false }).tree, "existing-web-controls");
});
test("same-frame taps take the ref lock before any awaited request; cleanup failure retries OFF", async () => {
  let release; const pending = new Promise(resolve => { release = resolve; });
  const h = render({}, { on: () => pending });
  h.button.props.onClick(); h.button.props.onClick();
  assert.equal(h.counts.on, 1); release(); await pending;
  const retry = render({ phase: "error", cleanupPending: true, error: "취소 실패" });
  retry.button.props.onClick(); assert.equal(retry.counts.off, 1); assert.equal(retry.counts.on, 0);
});

test("unsupported Android/old iOS use compact disabled OFF with an accessible reason, never web fallback", () => {
  const h = render({ native: true, available: false, phase: "ready", enabled: true });
  assert.notEqual(h.tree, "existing-web-controls");
  assert.equal(h.button.props.disabled, true); assert.equal(h.button.props["aria-checked"], false);
  const descriptions = h.button.props["aria-describedby"].split(" ").map(id => h.nodes.find(n => n.props?.id === id)?.props.children);
  assert.ok(descriptions.includes("OFF · 미지원"));
  assert.ok(descriptions.includes("이 기기에서는 알림을 지원하지 않아요."));
  h.button.props.onClick(); assert.equal(h.counts.on, 0); assert.equal(h.counts.off, 0);
});
