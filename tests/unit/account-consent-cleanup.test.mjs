import test from "node:test";
import assert from "node:assert/strict";
import { eraseAccountData, DELETION_KEY } from "../../app/todo/account-data.ts";
import { consentKey, grantAIConsent, readAIConsent, requireAIConsent } from "../../app/todo/ai-consent.ts";
function storage() {
  const values = new Map();
  return { values, get length() { return values.size; }, key: i => [...values.keys()][i] ?? null, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => { values.delete(key); } };
}
test("account cleanup removes both recipients, including stale/malformed receipts, without touching guest, other scopes or source plans", () => {
  const s = storage(), owner = "account/a", sibling = "account/ab";
  const keep = new Map([["oddk.todo.v1", "guest original"], ["oddk.sync.plan.account/ab", "other original"], ["oddk.drafts.v1.local.workspace", "guest draft"], [DELETION_KEY, "retry marker"]]);
  for (const scope of ["local", sibling]) for (const target of ["gateway", "local"]) keep.set(consentKey({ scope, target }), `keep-${scope}-${target}`);
  for (const [key, value] of keep) s.setItem(key, value);
  s.setItem(consentKey({ scope: owner, target: "gateway" }), "malformed old receipt");
  s.setItem(consentKey({ scope: owner, target: "local" }), JSON.stringify({ version: "old", scope: owner, acceptedAt: "old" }));
  s.setItem(`oddk.sync.plan.${owner}`, "deleted account plan");
  s.setItem(`oddk.drafts.v1.${encodeURIComponent(owner)}.goal-boards`, "deleted account draft");
  eraseAccountData(s, owner);
  assert.deepEqual(s.values, keep);
});
test("removing a current account receipt invalidates an already issued AI permit", () => {
  const s = storage(), context = { scope: "cleanup-active-account", target: "gateway" };
  grantAIConsent(context, s);
  const permit = requireAIConsent(context, s, () => context, new AbortController().signal);
  eraseAccountData(s, context.scope);
  assert.equal(readAIConsent(context, s), null);
  assert.throws(() => permit.assertCurrent(), /동의나 계정/);
});
test("receipt removal throw, silent refusal and readback failure preserve retry marker and recoverable plans", () => {
  for (const failure of ["throw", "silent", "readback"]) {
    const s = storage(), owner = `failed-${failure}`, key = consentKey({ scope: owner, target: "local" });
    s.setItem(key, "old receipt"); s.setItem(`oddk.sync.plan.${owner}`, "original plan"); s.setItem(DELETION_KEY, "retry marker");
    const remove = s.removeItem, read = s.getItem;
    s.removeItem = k => { if (k === key && failure === "throw") throw Error("storage denied"); if (k === key && failure === "silent") return; remove(k); };
    s.getItem = k => { if (k === key && failure === "readback") throw Error("read denied"); return read(k); };
    assert.throws(() => eraseAccountData(s, owner), /AI 동의 기록.*다시 확인/);
    assert.equal(s.values.get(DELETION_KEY), "retry marker");
    assert.equal(s.values.get(`oddk.sync.plan.${owner}`), "original plan");
    s.removeItem = remove; s.getItem = read;
    eraseAccountData(s, owner);
    assert.equal(s.values.has(key), false); assert.equal(s.values.has(`oddk.sync.plan.${owner}`), false);
    assert.equal(s.values.get(DELETION_KEY), "retry marker", "only the deletion orchestrator may clear the marker last");
  }
});
test("an accidental guest or unreadable deletion scope never clears its receipts or plan", () => {
  for (const scope of ["local", "unreadable-session"]) {
    const s = storage(); s.setItem(consentKey({ scope, target: "local" }), "keep"); s.setItem(`oddk.sync.plan.${scope}`, "keep");
    const before = new Map(s.values);
    assert.throws(() => eraseAccountData(s, scope), /계정/); assert.deepEqual(s.values, before);
  }
});
