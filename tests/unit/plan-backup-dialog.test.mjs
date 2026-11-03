import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as backup from "../../app/todo/plan-backup.ts";
import { loadPlan } from "../../supabase/functions/_shared/plan-migration.ts";
const element = (type, props) => ({ type, props });
const nodes = node => !node || typeof node !== "object" ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
const text = node => typeof node === "string" || typeof node === "number" ? String(node) : node && typeof node === "object" ? [node.props?.children].flat(Infinity).map(text).join("") : "";
const tick = () => new Promise(setImmediate);
function hooks() {
  const states = [], refs = []; let s = 0, r = 0, stop;
  return { reset() { s = 0; r = 0; }, useEffect() {}, useCallback: fn => fn,
    useRef(value) { return refs[r++] ??= { current: value }; },
    useState(value) { const i = s++; if (!(i in states)) states[i] = value; return [states[i], next => { states[i] = typeof next === "function" ? next(states[i]) : next; }]; },
    useSyncExternalStore(subscribe, snapshot) { stop ??= subscribe(() => {}); return snapshot(); } };
}
function setup() {
  let plan = loadPlan(JSON.stringify({ start: "09:00", tasks: [], review: "현재 내용" })).plan, scope = "local", failed = false;
  const original = JSON.stringify(plan), writes = [], listeners = new Set();
  const target = () => ({ scope, identity: scope, snapshot: JSON.stringify(plan) });
  const port = { readPlanReplacementTarget: target, subscribePlan: fn => { listeners.add(fn); return () => listeners.delete(fn); }, subscribeSync: () => () => {},
    replacePlanFromBackup(incoming, expected) {
      if (JSON.stringify(expected) !== JSON.stringify(target())) throw Error("현재 내용 변경");
      if (failed) throw Error("저장하지 못했어요. 현재 내용은 유지했어요.");
      writes.push(incoming); plan = incoming;
    } };
  const parent = hooks(); let dialog = hooks(), current = parent;
  const exports = {}, code = ts.transpileModule(readFileSync(new URL("../../app/todo/plan-backup-dialog.tsx", import.meta.url), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { exports, Error, require(name) {
    if (name === "react") return { useRef: (...a) => current.useRef(...a), useState: (...a) => current.useState(...a), useEffect: (...a) => current.useEffect(...a), useCallback: (...a) => current.useCallback(...a), useSyncExternalStore: (...a) => current.useSyncExternalStore(...a) };
    if (name === "react/jsx-runtime") return { jsx: element, jsxs: element };
    if (name === "react-icons/hi2" || name === "./dialog-focus") return {};
    if (name.endsWith("plan-migration")) return { loadPlan };
    if (name === "./sync-store") return port;
    if (name === "./plan-backup") return backup;
    throw Error(name);
  } });
  const render = () => { current = parent; parent.reset(); return exports.PlanBackupImport({ fallback: original }); };
  const preview = () => nodes(render()).find(node => typeof node.type === "function");
  const renderDialog = () => { const node = preview(); current = dialog; dialog.reset(); return node.type(node.props); };
  const choose = file => { dialog = hooks(); nodes(render()).find(node => node.props?.type === "file").props.onChange({ target: { files: [file], value: "selected" } }); };
  return { writes, original, render, preview, renderDialog, choose, get plan() { return plan; }, fail() { failed = true; },
    changeScope(value) { scope = value; for (const listener of listeners) listener(); },
    apply() { nodes(renderDialog()).find(node => node.props?.className === "oddk-primary").props.onClick(); } };
}
const file = (raw, name = "backup.json") => ({ name, size: new TextEncoder().encode(raw).length, text: async () => raw });
const incoming = () => JSON.stringify({ start: "10:00", tasks: [], review: "가져올 내용" });

test("file preview and first apply never write; cancel preserves current data; only second explicit replacement writes", async () => {
  const h = setup(); h.choose(file(incoming())); await tick();
  assert.equal(h.writes.length, 0); assert.match(text(h.renderDialog()), /읽을 수 있는 백업/);
  h.apply(); assert.equal(h.writes.length, 0); assert.match(text(h.renderDialog()), /현재 내용을 바꿀까요/);
  h.preview().props.onClose(); assert.equal(h.preview(), undefined); assert.equal(JSON.stringify(h.plan), h.original);
  h.choose(file(incoming())); await tick(); h.apply(); h.apply();
  assert.equal(h.writes.length, 1); assert.equal(h.plan.review, "가져올 내용"); assert.equal(h.preview(), undefined);
});

test("scope change during file reading and A-to-B-to-A during preview cannot apply stale input", async () => {
  const h = setup(); let finish;
  h.choose({ name: "slow.json", size: 1, text: () => new Promise(resolve => { finish = resolve; }) });
  h.changeScope("other"); finish(incoming()); await tick();
  assert.equal(h.preview(), undefined); assert.match(text(h.render()), /바뀌었어요/); assert.equal(h.writes.length, 0);
  h.changeScope("local"); h.choose(file(incoming())); await tick();
  const originalPreview = h.preview();
  h.changeScope("other"); h.changeScope("local");
  assert.throws(() => originalPreview.props.onApply(), /바뀌었어요/);
  assert.equal(nodes(h.renderDialog()).find(node => node.props?.className === "oddk-primary").props.disabled, true);
  assert.equal(JSON.stringify(h.plan), h.original);
});

test("bad file and failed storage keep original data and show errors without reporting success", async () => {
  const h = setup(); h.choose(file("broken")); await tick();
  assert.equal(h.preview(), undefined); assert.match(text(h.render()), /가져올 수 없어요/);
  h.choose(file(incoming())); await tick(); h.fail(); h.apply(); h.apply();
  assert.match(text(h.renderDialog()), /저장하지 못했어요/); assert.equal(h.writes.length, 0);
  assert.equal(JSON.stringify(h.plan), h.original); assert(!text(h.render()).includes("백업을 적용했어요"));
});
