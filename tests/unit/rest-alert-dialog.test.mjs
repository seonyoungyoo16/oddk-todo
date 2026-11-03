import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { REST_ALERT_MINUTES } from "../../app/todo/rest-alert.ts";
import { formatExecutionClock } from "../../app/todo/execution-timer.ts";

const element = (type, props) => ({ type, props });
const nodes = node => !node || typeof node !== "object" ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
const text = node => typeof node === "string" || typeof node === "number" ? String(node) : node && typeof node === "object" ? [node.props?.children].flat(Infinity).map(text).join("") : "";
test("actual chooser defaults to an uncommitted 5 minutes; explicit submit, no-alert selection, cancel and edit are distinct", async () => {
  const js = ts.transpileModule(readFileSync(new URL("../../app/todo/rest-alert-dialog.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  let chosen; const exports = {}, calls = []; let cancelled = 0;
  vm.runInNewContext(js, { exports, require(name) {
    if (name === "react/jsx-runtime") return { jsx: element, jsxs: element };
    if (name === "react") return { useState: initial => [chosen ?? initial, value => { chosen = value; }], useRef: () => ({ current: null }), useEffect() {} };
    if (name === "./rest-alert") return { REST_ALERT_MINUTES };
    if (name === "./execution-timer") return { formatExecutionClock };
    return {};
  } });
  const props = { editing: false, initialMinutes: 5, elapsedMs: 0, totalMs: 0, disabled: false, onApply: async value => calls.push(value), onClose: () => { cancelled++; } };
  const render = patch => exports.RestAlertDialog({ ...props, ...patch });
  let tree = render(); assert.equal(nodes(tree).find(n => n.type === "select").props.value, 5); assert.deepEqual(calls, []);
  nodes(tree).find(n => n.type === "button" && text(n) === "취소").props.onClick(); assert.equal(cancelled, 1); assert.deepEqual(calls, []);
  nodes(tree).find(n => n.type === "select").props.onChange({ target: { value: "0" } });
  tree = render(); nodes(tree).find(n => n.type === "form").props.onSubmit({ preventDefault() {} }); await Promise.resolve(); assert.deepEqual(calls, [0]);
  chosen = 5; tree = render({ editing: true, elapsedMs: 6 * 60000, totalMs: 11 * 60000 });
  assert.match(text(tree), /이번 휴식 00:06:00 경과 · 누적 휴식 00:11:00/); assert.match(text(tree), /이미 기준을 넘겼어요/);
  tree = render({ error: "휴식 알림 기준을 저장하지 못했어요." }); assert.match(text(nodes(tree).find(n => n.props?.role === "alert")), /저장하지 못했어요/);
  tree = render({ disabled: true }); nodes(tree).find(n => n.type === "form").props.onSubmit({ preventDefault() {} }); assert.deepEqual(calls, [0]);
});
