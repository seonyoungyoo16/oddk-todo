import * as dialogFocus from "../../app/todo/dialog-focus.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { prepareManualTask } from "../../app/todo/batch-tasks.ts";
import { splitWithRemoteAI } from "../../app/todo/remote-task-ai.ts";

const js = ts.transpileModule(readFileSync(new URL("../../app/todo/task-split-action.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const element = (type, props) => ({ type, props });
function nodes(node) {
  if (!node || typeof node !== "object") return [];
  return [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
}
function harness(options = {}) {
  const state = [], refs = [], calls = { auth: 0, ai: 0, save: [], snapshots: [], busy: [] };
  let stateIndex, refIndex, text = options.text ?? "보고서 작성", source = options.source ?? text;
  const Review = () => null, Consent = () => null;
  const exports = {};
  const react = { useRef: initial => refs[refIndex++] ??= { current: initial }, useState: initial => {
    const index = stateIndex++;
    if (!(index in state)) state[index] = initial;
    return [state[index], value => { state[index] = value; }];
  }, useEffect: () => {} };
  vm.runInNewContext(js, { exports, AbortController, Error, fetch, requestAnimationFrame: work => work(), location: { hostname: "example.invalid" }, document: { querySelector: () => ({}), body: {}, getElementById: () => ({ focus() {} }) }, require: name => {
    if (name === "react") return react;
    if (name === "./dialog-focus") return dialogFocus;
    if (name === "react/jsx-runtime") return { jsx: element, jsxs: element };
    if (name === "react-dom") return { createPortal: node => node };
    if (name === "@capacitor/core") return { Capacitor: { isNativePlatform: () => false } };
    if (name === "./ai-consent-controls") return { AIConsentDialog: Consent, AIConsentNote: () => null };
    if (name === "./ai-consent") return { consentedFetch: () => fetch };
    if (name === "./ai-consent-runtime") return { currentAIContext: () => ({ scope: options.loggedIn ? "account" : "local", target: "gateway", epoch: 0 }), hasAIConsent: () => options.consented !== false, aiRequestPermit: () => ({ assertCurrent() {} }), subscribeAIConsent: () => () => {} };
    if (name === "./native-options") return { usesLocalTaskAI: () => false };
    if (name === "./batch-tasks") return { prepareManualTask };
    if (name === "./supabase-client") return { syncClient: () => ({ auth: { getSession: async () => {
      calls.auth++;
      if (options.authError) throw Error("auth unavailable");
      return { data: { session: options.loggedIn ? { access_token: "synthetic", user: { id: "account" } } : null } };
    } } }) };
    if (name === "./remote-task-ai") return { splitWithRemoteAI: async (...args) => {
      calls.ai++;
      if (options.realAuthGuard) return splitWithRemoteAI(...args, async () => { throw Error("network must not run without login"); });
      if (options.aiError) throw Error("AI unavailable");
      return options.titles ?? ["보고서 작성"];
    } };
    if (name === "./local-task-ai") return { splitWithLocalAI: () => { throw Error("unexpected local AI"); } };
    if (name === "./task-split-review") return { TaskSplitReview: Review };
    if (name === "react-icons/hi2") return {};
    throw Error(`Unexpected dependency: ${name}`);
  } });
  const render = () => {
    stateIndex = 0; refIndex = 0;
    const tree = exports.TaskSplitAction({ source, disabled: false, children: null,
      onSourceSnapshot: value => { calls.snapshots.push(value); source = value; },
      onBusyChange: value => calls.busy.push(value),
      onAdd: (titles, original) => {
        if (options.saveError) return options.saveError;
        calls.save.push({ titles: [...titles], original }); text = ""; source = ""; return null;
      } });
    refs[1].current = { querySelector: () => ({ value: text }) };
    return tree;
  };
  const find = predicate => nodes(render()).find(predicate);
  return { calls, render, submit: () => render().props.onSubmit({ preventDefault() {} }),
    analyze: async () => { find(node => node.props?.["aria-label"] === "AI 분석").props.onClick(); await new Promise(setImmediate); },
    review: () => find(node => node.type === Review),
    consent: () => find(node => node.type === Consent),
    error: () => find(node => node.props?.className === "oddk-aiSplitError")?.props.children,
    get text() { return text; } };
}

test("default submit saves exact visible text without consulting auth or AI, including late IME text", () => {
  const h = harness({ text: "물 마시기", source: "물 마시", authError: true, aiError: true });
  h.submit();
  assert.deepEqual(h.calls.save, [{ titles: ["물 마시기"], original: "물 마시기" }]);
  assert.deepEqual(h.calls.snapshots, ["물 마시기"]);
  assert.equal(h.calls.auth, 0); assert.equal(h.calls.ai, 0);
  assert.equal(h.review(), undefined); assert.equal(h.text, "");
});
test("manual input preserves a long original and does not split a sentence or multiline input", () => {
  for (const text of ["운동하고 장 보고 메일 보내기", "보고서 작성\n메일 보내기"]) assert.deepEqual(prepareManualTask(text), { title: text, original: text });
  const text = "가".repeat(119) + "📚" + "다".repeat(60);
  const draft = prepareManualTask(text);
  assert.equal(draft.title, "가".repeat(119)); assert.equal(draft.original, text);
  const h = harness({ text }); h.submit();
  assert.deepEqual(h.calls.save, [{ titles: [draft.title], original: text }]);
  for (const invalid of [" ", "x".repeat(2001)]) assert.throws(() => prepareManualTask(invalid));
});
test("save failure retains input and offers retry without any AI request", () => {
  const h = harness({ text: "원문 유지", saveError: "저장 공간을 확인해주세요." });
  h.submit(); assert.equal(h.error(), "저장 공간을 확인해주세요.");
  assert.equal(h.text, "원문 유지"); assert.equal(h.calls.ai, 0); assert.equal(h.calls.auth, 0);
});
test("a submit bubbling from the AI review portal cannot also trigger ordinary addition", () => {
  const h = harness({ text: "AI 확인할 원문" });
  h.render().props.onSubmit({ preventDefault() {}, target: {}, currentTarget: {} });
  assert.equal(h.calls.save.length, 0); assert.equal(h.calls.ai, 0);
  assert.equal(h.text, "AI 확인할 원문");
});
test("AI analysis is opt-in and always requires confirmation for one or many candidates", async () => {
  for (const titles of [["분석된 제목"], ["운동하기", "장보기"]]) {
    const h = harness({ text: "분석할 원문", loggedIn: true, titles });
    assert.equal(h.calls.ai, 0); await h.analyze();
    assert.equal(h.calls.ai, 1); assert.equal(h.calls.save.length, 0);
    assert.deepEqual([...h.review().props.candidates], titles);
    assert.equal(h.text, "분석할 원문");
    h.review().props.onAdd(titles);
    assert.deepEqual(h.calls.save, [{ titles, original: "분석할 원문" }]);
    assert.equal(h.review(), undefined);
  }
});
test("first consent does not consult auth or AI and preserves the last visible IME character", async () => {
  const h = harness({ text: "물 마시기", source: "물 마시", loggedIn: true, consented: false });
  await h.analyze();
  assert.ok(h.consent()); assert.equal(h.review(), undefined);
  assert.equal(h.calls.ai, 0); assert.equal(h.calls.auth, 0);
  assert.deepEqual(h.calls.snapshots, ["물 마시기"]);
  h.consent().props.onClose(); assert.equal(h.consent(), undefined); assert.equal(h.text, "물 마시기");
});
test("unauthenticated or unavailable AI preserves the source for ordinary addition", async () => {
  for (const options of [{ realAuthGuard: true }, { loggedIn: true, aiError: true }]) {
    const h = harness({ text: "AI 실패 후 일반 추가", ...options });
    await h.analyze(); assert.ok(h.error());
    assert.equal(h.text, "AI 실패 후 일반 추가"); assert.equal(h.calls.save.length, 0);
    h.submit(); assert.deepEqual(h.calls.save[0].titles, ["AI 실패 후 일반 추가"]);
    assert.equal(h.calls.ai, options.loggedIn ? 1 : 0, "default retry cannot invoke AI again");
    assert.equal(h.error(), undefined);
  }
});
