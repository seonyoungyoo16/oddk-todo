import * as dialogFocus from "../../app/todo/dialog-focus.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { parseTaskCandidates, prepareManualTask } from "../../app/todo/batch-tasks.ts";

const element = (type, props) => ({ type, props });
const nodes = n => !n || typeof n !== "object" ? [] : [n, ...[n.props?.children].flat(Infinity).flatMap(nodes)];
const text = n => typeof n === "string" || typeof n === "number" ? String(n) : n && typeof n === "object" ? [n.props?.children].flat(Infinity).map(text).join("") : "";
const tick = () => new Promise(setImmediate);
function hooks() {
  const states = [], refs = [], effects = []; let s = 0, r = 0, e = 0;
  return { reset() { s = 0; r = 0; e = 0; }, refs,
    useRef: initial => refs[r++] ??= { current: initial },
    useState(initial) { const index = s++; if (!(index in states)) states[index] = initial; return [states[index], next => { states[index] = typeof next === "function" ? next(states[index]) : next; }]; },
    useEffect(fn, deps) { const index = e++, before = effects[index]; if (!before || deps.some((x, i) => x !== before.deps[i])) { before?.cleanup?.(); effects[index] = { fn, deps }; } },
    flush() { for (const effect of effects) if (effect.fn) { effect.cleanup = effect.fn(); effect.fn = null; } },
    unmount() { for (const effect of effects) effect.cleanup?.(); }
  };
}
function load(file, require, globals = {}) {
  const exports = {}, input = readFileSync(new URL(`../../app/todo/${file}`, import.meta.url), "utf8");
  const js = ts.transpileModule(input, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(js, { exports, require: name => name === "./dialog-focus" ? dialogFocus : require(name), AbortController, Error, ...globals }); return exports;
}
function action(options = {}) {
  const h = hooks(), calls = { ai: 0, auth: 0, saves: [], busy: [], snapshots: [], permits: 0 }, pending = [];
  let source = "운동하고 장 보고 메일 보내기", visible = source, context = { scope: "account", target: "gateway", epoch: 1 }, consented = options.consented !== false, subscribed, saveFailure = options.saveFailure ?? null;
  const Review = () => null, Consent = () => null, trigger = { isConnected: true, focus() {} };
  const busyChange = value => calls.busy.push(value), snapshot = value => { source = value; calls.snapshots.push(value); };
  const save = (titles, original) => { calls.saves.push({ titles: [...titles], original }); if (saveFailure) return saveFailure; source = ""; visible = ""; return null; };
  const api = load("task-split-action.tsx", name => {
    if (name === "react") return h;
    if (name === "react/jsx-runtime") return { jsx: element, jsxs: element };
    if (name === "react-dom") return { createPortal: node => node };
    if (name === "react-icons/hi2") return {};
    if (name === "@capacitor/core") return { Capacitor: { isNativePlatform: () => false } };
    if (name === "./native-options") return { usesLocalTaskAI: () => false };
    if (name === "./batch-tasks") return { prepareManualTask };
    if (name === "./task-split-review") return { TaskSplitReview: Review };
    if (name === "./ai-consent-controls") return { AIConsentDialog: Consent, AIConsentNote: () => null };
    if (name === "./ai-consent") return { consentedFetch: () => () => {} };
    if (name === "./ai-consent-runtime") return {
      currentAIContext: () => context, hasAIConsent: () => consented,
      sameAIContext: (a, b) => a.scope === b.scope && a.epoch === b.epoch,
      saveAIConsent() { consented = true; }, subscribeAIConsent(fn) { subscribed = fn; return () => {}; },
      aiRequestPermit(expected, signal) { calls.permits++; return { assertCurrent() { if (signal.aborted || expected.epoch !== context.epoch || expected.scope !== context.scope) throw Error("동의/계정 변경"); } }; }
    };
    if (name === "./supabase-client") return { syncClient: () => ({ auth: { async getSession() { calls.auth++; return { data: { session: { access_token: "synthetic-only", user: { id: context.scope } } } }; } } }) };
    if (name === "./remote-task-ai") return { splitWithRemoteAI(...args) { calls.ai++; return new Promise((resolve, reject) => pending.push({ resolve, reject, signal: args[1] })); } };
    if (name === "./local-task-ai") return { splitWithLocalAI() { throw Error("Unexpected local API"); } };
    throw Error(name);
  }, { location: { hostname: "example.invalid" }, requestAnimationFrame: fn => fn(), document: { querySelector: () => ({}), body: {}, getElementById: () => ({ focus() {} }) } });
  function render() {
    h.reset(); const tree = api.TaskSplitAction({ source, disabled: false, children: null, onSourceSnapshot: snapshot, onBusyChange: busyChange, onAdd: save });
    h.refs[1].current = { querySelector: () => ({ value: visible }) }; h.refs[3].current = trigger; h.flush(); return tree;
  }
  const find = predicate => nodes(render()).find(predicate);
  render();
  return { calls, pending, render, review: () => find(n => n.type === Review), consent: () => find(n => n.type === Consent),
    start() { find(n => n.props?.["aria-label"] === "AI 분석").props.onClick(); return this.review(); },
    async resolve(index = 0, titles = ["운동하기", "장보기", "메일 보내기"]) { pending[index].resolve(titles); await tick(); },
    async fail(index = 0) { pending[index].reject(Error("연결하지 못했어요")); await tick(); },
    visible() { return visible; }, changeSource(value) { visible = value; source = value; }, allowSave() { saveFailure = null; },
    changeAccount() { context = { ...context, epoch: context.epoch + 1 }; subscribed(); }, unmount: () => h.unmount()
  };
}

test("authorized analysis shows busy before awaiting AI, stays in the same review slot, and never saves without explicit add", async () => {
  const h = action(), busy = h.start();
  assert.equal(busy.props.phase, "busy"); assert.equal(h.calls.saves.length, 0);
  const busyTrigger = nodes(h.render()).find(n => n.props?.["aria-label"] === "AI 분석");
  assert.equal(text(busyTrigger), "AI 분석"); assert.equal(busyTrigger.props["aria-busy"], true);
  h.start(); await tick(); assert.equal(h.calls.ai, 1, "rapid re-entry has one active request");
  await h.resolve(); const result = h.review();
  assert.equal(result.type, busy.type); assert.equal(result.props.phase, "result"); assert.equal(h.calls.saves.length, 0);
  assert.equal(h.visible(), "운동하고 장 보고 메일 보내기");
  result.props.onAdd(["운동하기", "장보기"]); result.props.onAdd(["운동하기", "장보기"]);
  assert.equal(h.calls.saves.length, 1); assert.equal(h.visible(), ""); assert.equal(h.review(), undefined);
  const trigger = nodes(h.render()).find(n => n.props?.["aria-label"] === "AI 분석");
  assert.equal(trigger.props.disabled, false); assert.equal(trigger.props["aria-disabled"], true, "empty source remains focusable but cannot start a request");
});

test("pointer repeats cannot reach background navigation after close; keyboard clicks and a new modal remain usable", () => {
  const api = load("task-split-review.tsx", name => name === "react/jsx-runtime" ? { jsx: element, jsxs: element } : {});
  const listeners = new Map(); let expire;
  const doc = { defaultView: { setTimeout(fn, ms) { assert.equal(ms, 350); expire = fn; } }, addEventListener(type, callback) { listeners.set(type, callback); }, removeEventListener(type, callback) { if (listeners.get(type) === callback) listeners.delete(type); } };
  api.protectTaskSplitReturn(doc);
  assert.equal(listeners.size, 4);
  let blocked = 0, stopped = 0;
  for (const type of ["pointerdown", "pointerup", "click", "dblclick"]) listeners.get(type)({ type, detail: 2, target: null, preventDefault() { blocked++; }, stopImmediatePropagation() { stopped++; } });
  assert.equal(blocked, 4); assert.equal(stopped, 4);
  listeners.get("click")({ type: "click", detail: 0, preventDefault() { throw Error("keyboard blocked"); } });
  listeners.get("pointerdown")({ type: "pointerdown", target: { closest: () => ({}) }, preventDefault() { throw Error("new modal blocked"); } });
  expire(); assert.equal(listeners.size, 0);
});

test("abort closes immediately, preserves source, ignores a stale completion and permits one fresh analysis", async () => {
  const h = action(); h.start(); await tick();
  h.review().props.onCancel(); assert.equal(h.pending[0].signal.aborted, true); assert.equal(h.review(), undefined);
  h.start(); await tick(); assert.equal(h.calls.ai, 2);
  await h.resolve(0, ["stale"]); assert.equal(h.review().props.phase, "busy");
  await h.resolve(1, ["fresh"]); assert.equal(h.review().props.candidates[0], "fresh");
  assert.equal(h.visible(), "운동하고 장 보고 메일 보내기"); assert.equal(h.calls.saves.length, 0);
});

test("AI error and retry stay in the dialog, while a failed save retains both edited candidates and original source", async () => {
  const h = action({ saveFailure: "저장 실패" }); h.start(); await tick(); await h.fail();
  const error = h.review(); assert.equal(error.props.phase, "error"); assert.match(error.props.message, /연결/);
  error.props.onRetry(); await tick(); await h.resolve(1);
  assert.equal(h.review().props.onAdd(["수정한 후보"]), "저장 실패"); assert.equal(h.review().props.phase, "result"); assert(h.visible());
  h.allowSave(); assert.equal(h.review().props.onAdd(["수정한 후보"]), null); assert.equal(h.visible(), "");
});

test("changed source, revoked consent/account and unmount reject stale adds without clearing user text", async () => {
  const changed = action(); changed.start(); await tick(); await changed.resolve(); changed.changeSource("외부에서 바뀐 입력");
  assert.match(changed.review().props.onAdd(["후보"]), /입력/); assert.equal(changed.calls.saves.length, 0); assert.equal(changed.visible(), "외부에서 바뀐 입력");
  const revoked = action(); revoked.start(); await tick(); await revoked.resolve(); const old = revoked.review(); revoked.changeAccount();
  assert.equal(revoked.review().props.phase, "error"); assert.match(old.props.onAdd(["후보"]), /다시 확인/); assert.equal(revoked.calls.saves.length, 0); assert(revoked.visible());
  const unmounted = action(); unmounted.start(); await tick(); unmounted.unmount(); await unmounted.resolve();
  assert.equal(unmounted.calls.saves.length, 0); assert.equal(unmounted.pending[0].signal.aborted, true);
});

test("first-consent UI still precedes auth and model work, and closing it keeps source", () => {
  const h = action({ consented: false }); h.start();
  assert(h.consent()); assert.equal(h.review(), undefined); assert.equal(h.calls.auth, 0); assert.equal(h.calls.ai, 0);
  h.consent().props.onClose(); assert.equal(h.consent(), undefined); assert(h.visible());
});

test("one fixed review contains busy/error actions, then editable result candidates with explicit successful submission only", () => {
  let active = hooks(), retry = 0, cancel = 0, saveFailure = true;
  const saves = [], Textarea = () => null;
  const react = { useRef: value => active.useRef(value), useState: value => active.useState(value), useEffect: (...args) => active.useEffect(...args) };
  const api = load("task-split-review.tsx", name => {
    if (name === "react") return react;
    if (name === "react/jsx-runtime") return { jsx: element, jsxs: element };
    if (name === "./batch-tasks") return { parseTaskCandidates };
    if (name === "./auto-textarea") return { AutoTextarea: Textarea };
    return {};
  });
  const props = { source: "원문은 그대로", candidates: ["운동하기", "장보기"], onRetry: () => { retry++; }, onCancel: () => { cancel++; }, onAdd(titles) { saves.push([...titles]); return saveFailure ? "저장하지 못했어요" : null; } };
  const reviewHooks = hooks();
  const review = phase => { active = reviewHooks; active.reset(); return api.TaskSplitReview({ ...props, phase }); };
  const busy = review("busy"), error = review("error");
  assert.equal(busy.type, "dialog"); assert.equal(error.type, "dialog");
  assert.equal(busy.props.className, error.props.className);
  assert(nodes(busy).some(n => n.props?.role === "status" && text(n).includes("나누고 있어요")));
  assert(nodes(busy).some(n => n.type === "button" && n.props.disabled && text(n) === "분석 중"));
  nodes(error).find(n => n.type === "button" && text(n) === "다시 분석").props.onClick(); assert.equal(retry, 1);
  const editor = nodes(review("result")).find(n => typeof n.type === "function");
  const editorHooks = hooks(), render = () => { active = editorHooks; active.reset(); return editor.type(editor.props); };
  assert.equal(saves.length, 0);
  let tree = nodes(render()); tree.find(n => n.type === Textarea).props.onChange({ target: { value: "수정한 제목" } });
  tree = nodes(render()); tree.find(n => n.props?.["aria-label"] === "할 일 2 제외").props.onClick();
  tree = nodes(render()); assert.equal(tree.filter(n => n.type === Textarea).length, 1);
  const submit = () => nodes(render()).find(n => n.type === "form").props.onSubmit({ preventDefault() {} });
  submit(); assert.deepEqual(saves, [["수정한 제목"]]); assert(nodes(render()).some(n => n.props?.role === "alert" && text(n) === "저장하지 못했어요"));
  assert.equal(nodes(render()).find(n => n.type === Textarea).props.value, "수정한 제목");
  saveFailure = false; submit(); submit(); assert.equal(saves.length, 2, "successful submit locks out repeat Enter/click");
  assert.equal(nodes(render()).find(n => n.type === "button" && n.props.type === "submit").props.form, "task-split-confirm");
  nodes(busy).find(n => n.type === "button" && text(n) === "중단하고 돌아가기").props.onClick(); assert.equal(cancel, 1);
});

test("modal session restores page, list and composer scroll, exact styles and AI trigger focus once", () => {
  const h = hooks(), api = load("task-split-review.tsx", name => {
    if (name === "react") return h;
    if (name === "react/jsx-runtime") return { jsx: element, jsxs: element };
    if (name === "./batch-tasks") return { parseTaskCandidates };
    return {};
  });
  const events = [], body = { overflow: "auto", position: "relative", top: "1px", left: "2px", right: "3px", width: "90%" }, original = { ...body };
  const list = { isConnected: true, scrollTop: 260, scrollLeft: 0 }, composer = { isConnected: true, scrollTop: 40, scrollLeft: 8 };
  const win = { scrollX: 7, scrollY: 540, scrollTo(value) { events.push(["scroll", value]); } };
  const doc = { body: { style: body }, documentElement: { style: { overflow: "visible" } }, defaultView: win, querySelectorAll: () => [list, composer] };
  const dialog = { ownerDocument: doc, open: false, showModal() { this.open = true; }, close() { this.open = false; events.push(["close"]); }, querySelector: () => ({ focus: options => events.push(["close-focus", options]) }) };
  const close = api.openTaskSplitDialog(dialog, { isConnected: true, focus: options => events.push(["opener-focus", options]) });
  assert.equal(body.position, "fixed"); assert.equal(body.top, "-540px"); list.scrollTop = 999; composer.scrollTop = 999; close(); close();
  assert.deepEqual(body, original); assert.equal(doc.documentElement.style.overflow, "visible"); assert.equal(list.scrollTop, 260); assert.equal(composer.scrollTop, 40);
  assert.equal(events.filter(e => e[0] === "close").length, 1); assert.equal(events.filter(e => e[0] === "opener-focus").length, 1);
  assert.equal(events.find(e => e[0] === "scroll")[1].top, 540);
});
