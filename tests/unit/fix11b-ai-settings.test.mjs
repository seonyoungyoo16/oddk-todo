import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as consent from "../../app/todo/ai-consent.ts";
import * as policy from "../../app/todo/ai-policy.ts";

const element = (type, props) => ({ type, props });
const nodes = node => !node || typeof node !== "object" ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
const text = node => typeof node === "string" || typeof node === "number" ? String(node) : node && typeof node === "object" ? [node.props?.children].flat(Infinity).map(text).join("") : "";
function hooks() {
  const states = []; let index = 0;
  return { reset() { index = 0; }, useEffect() {}, useRef: value => ({ current: value }),
    useState(value) { const i = index++; if (!(i in states)) states[i] = value; return [states[i], next => { states[i] = typeof next === "function" ? next(states[i]) : next; }]; },
    useSyncExternalStore(_subscribe, snapshot) { return snapshot(); } };
}
function load(file, require, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(`../../app/todo/${file}`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { exports, require, Event, Error, ...globals }); return exports;
}
function setup() {
  const values = new Map(), scope = crypto.randomUUID(), win = new EventTarget();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, raw) => values.set(key, raw), removeItem: key => values.delete(key) };
  const runtime = load("ai-consent-runtime.ts", name => {
    if (name === "@capacitor/core") return { Capacitor: { isNativePlatform: () => false } };
    if (name === "./native-options") return { usesLocalTaskAI: () => false };
    if (name === "./sync-store") return { getPlanScope: () => scope, hasPendingAccountDeletion: () => false, subscribePlan: () => () => {}, subscribeSync: () => () => {} };
    if (name === "./supabase-client") return { syncClient: () => ({ auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } }) };
    if (name === "./ai-consent") return consent;
    throw Error(name);
  }, { localStorage: storage, window: win, location: { hostname: "example.invalid" } });
  const settings = hooks(), notice = hooks(); let currentHooks = settings;
  const controls = load("ai-consent-controls.tsx", name => {
    if (name === "react") return { useState: (...args) => currentHooks.useState(...args), useEffect: (...args) => currentHooks.useEffect(...args), useRef: (...args) => currentHooks.useRef(...args), useSyncExternalStore: (...args) => currentHooks.useSyncExternalStore(...args) };
    if (name === "react/jsx-runtime") return { jsx: element, jsxs: element };
    if (name === "react-icons/hi2" || name === "./dialog-focus") return {};
    if (name === "./ai-consent") return consent;
    if (name === "./ai-policy") return policy;
    if (name === "./ai-consent-runtime") return runtime;
    throw Error(name);
  }, { localStorage: storage, process: { env: {} } });
  const render = () => { currentHooks = settings; settings.reset(); return controls.AIConsentSettings(); };
  const dialogNode = () => nodes(render()).find(node => node.type === controls.AIConsentDialog);
  const renderDialog = () => { const node = dialogNode(); currentHooks = notice; notice.reset(); return node.type(node.props); };
  return { runtime, values, storage, render, renderDialog, dialogNode,
    toggle() { nodes(render()).find(node => node.props?.role === "switch").props.onClick(); },
    checked() { return nodes(render()).find(node => node.props?.role === "switch").props["aria-checked"]; },
    confirm() { nodes(renderDialog()).find(node => node.props?.className === "oddk-primary").props.onClick(); },
    check() { nodes(renderDialog()).find(node => node.props?.type === "checkbox").props.onChange({ target: { checked: true } }); },
  };
}

test("AI switch grants only after the actual notice checkbox and confirmation; cancel stays off", () => {
  const h = setup(); assert.equal(h.checked(), false);
  h.toggle(); assert.equal(h.checked(), false); h.confirm(); assert.equal(h.checked(), false);
  h.dialogNode().props.onClose(); assert.equal(h.checked(), false); assert.equal(h.values.size, 0);
  h.toggle(); h.check(); h.confirm(); assert.equal(h.checked(), true);
  assert.equal(h.runtime.hasAIConsent(h.runtime.currentAIContext()), true);
});

test("the actual OFF handler revokes the live receipt, aborts a subscribed request and rejects late results", async () => {
  const h = setup(); h.toggle(); h.check(); h.confirm();
  const controller = new AbortController(), permit = h.runtime.aiRequestPermit(h.runtime.currentAIContext(), controller.signal);
  const stop = h.runtime.subscribeAIConsent(() => { try { permit.assertCurrent(); } catch { controller.abort(); } });
  let complete;
  const response = consent.consentedFetch(permit, () => new Promise(resolve => { complete = resolve; }))("https://example.invalid");
  h.toggle(); assert.equal(h.checked(), false); assert.equal(controller.signal.aborted, true);
  complete(Response.json({ titles: ["late"] })); await assert.rejects(response);
  assert.throws(() => permit.assertCurrent()); stop();
});

test("grant failure and revocation persistence failure remain OFF and expose an honest error", () => {
  const h = setup(); h.storage.setItem = () => { throw Error("quota"); };
  h.toggle(); h.check(); h.confirm(); assert.equal(h.checked(), false); assert.match(text(h.renderDialog()), /동의를 저장하지 못/);
  const enabled = setup(); enabled.toggle(); enabled.check(); enabled.confirm();
  enabled.storage.removeItem = () => { throw Error("denied"); };
  enabled.toggle(); assert.equal(enabled.checked(), false); assert.match(text(enabled.render()), /철회를 저장하지 못/);
});

test("compact notice keeps recipient and fields visible while retention, scope and policy links remain in collapsed details", () => {
  const h = setup(); h.toggle(); const tree = h.renderDialog(), all = nodes(tree);
  const facts = all.find(node => node.type === "dl"), details = all.find(node => node.type === "details");
  assert.match(text(facts), /oddk 운영자의 AI 서버/); assert.match(text(facts), /로그인 인증 토큰/);
  assert(!details.props.open); assert.match(text(details), /보관 기간은 현재 확인 중/); assert.match(text(details), /회수나 외부 로그 삭제/);
  assert.equal(nodes(details).filter(node => node.type === "a").length, 2);
});
