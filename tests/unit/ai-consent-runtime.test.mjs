import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { usesLocalTaskAI } from "../../app/todo/native-options.ts";
const js = ts.transpileModule(readFileSync(new URL("../../app/todo/ai-consent-runtime.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function runtime(hostname = "example.invalid", native = false) {
  let scope = "A", pending = false, callback;
  const exports = {}, window = new EventTarget();
  const store = { getPlanScope: () => scope, hasPendingAccountDeletion: () => pending, subscribePlan: () => () => {}, subscribeSync: () => () => {} };
  vm.runInNewContext(js, { exports, Event, window, location: { hostname }, localStorage: {}, require(name) {
    if (name === "@capacitor/core") return { Capacitor: { isNativePlatform: () => native } };
    if (name === "./native-options") return { usesLocalTaskAI };
    if (name === "./sync-store") return store;
    if (name === "./supabase-client") return { syncClient: () => ({ auth: { onAuthStateChange(fn) { callback = fn; return { data: { subscription: { unsubscribe() {} } } }; } } }) };
    if (name === "./ai-consent") return { AI_CONSENT_PREFIX: "fixture", readAIConsent: () => "receipt", aiConsentChanges: () => [] };
    throw Error(name);
  } });
  exports.subscribeAIConsent(() => {});
  return { api: exports, plan(value) { scope = value; }, auth(value) { callback("SIGNED_IN", value ? { user: { id: value } } : null); }, pending(value) { pending = value; } };
}
test("both local Ollama and gateway block the auth-to-plan transition window", () => {
  for (const hostname of ["localhost", "example.invalid"]) {
    const r = runtime(hostname); r.auth("A");
    const before = r.api.currentAIContext();
    r.auth("B"); assert.throws(() => r.api.currentAIContext(), /전환 중/);
    r.plan("B"); assert.equal(r.api.currentAIContext().scope, "B");
    r.auth("A"); r.plan("A");
    assert.equal(r.api.sameAIContext(before, r.api.currentAIContext()), false, "A→B→A must invalidate stale work even with the same consent receipt");
  }
});
test("logout blocks pending old-account work and only permits the new local scope after transition", () => {
  const r = runtime("localhost"); r.auth("A"); const old = r.api.currentAIContext();
  r.auth(null); assert.throws(() => r.api.currentAIContext(), /전환 중/);
  r.plan("local"); const current = r.api.currentAIContext();
  assert.equal(current.scope, "local"); assert.equal(r.api.sameAIContext(old, current), false);
});
test("a phone localhost uses the gateway while a desktop localhost uses local Ollama", () => {
  assert.equal(runtime("localhost", true).api.currentAIContext().target, "gateway");
  assert.equal(runtime("localhost", false).api.currentAIContext().target, "local");
});
test("deletion pending and unreadable sessions fail closed in both UI snapshot and requests", () => {
  const r = runtime(); r.pending(true);
  assert.throws(() => r.api.currentAIContext()); assert.equal(r.api.getAIConsentSnapshot(), "unavailable");
  r.pending(false); r.plan("unreadable-session");
  assert.throws(() => r.api.currentAIContext()); assert.equal(r.api.getAIConsentSnapshot(), "unavailable");
});
