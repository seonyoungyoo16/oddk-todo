import test from "node:test";
import assert from "node:assert/strict";
import { AI_CONSENT_VERSION, aiConsentChanges, consentKey, consentedFetch, grantAIConsent, readAIConsent, requireAIConsent, revokeAIConsent } from "../../app/todo/ai-consent.ts";
import { AI_PROCESSING_FACTS } from "../../app/todo/ai-policy.ts";
import { splitWithRemoteAI } from "../../app/todo/remote-task-ai.ts";
const context = () => ({ scope: crypto.randomUUID(), target: "gateway" });
function storage() {
  const data = new Map();
  return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
}
test("no consent, malformed or old notices cannot issue a network permit", () => {
  const ctx = context(), s = storage(), signal = new AbortController().signal;
  for (const raw of [null, "not JSON", "{}", JSON.stringify({ version: "old", ...ctx, granted: true })]) {
    if (raw) s.setItem(consentKey(ctx), raw);
    assert.equal(readAIConsent(ctx, s), null);
    assert.throws(() => requireAIConsent(ctx, s, () => ctx, signal), /동의/);
  }
});
test("receipt stores only scope, target, version and consent evidence, with explicit per-device/account/recipient isolation", () => {
  const ctx = context(), s = storage(); grantAIConsent(ctx, s);
  const receipt = JSON.parse(readAIConsent(ctx, s));
  assert.deepEqual(Object.keys(receipt).sort(), ["acceptedAt", "granted", "id", "policy", "scope", "target", "version"]);
  assert.equal(receipt.version, AI_CONSENT_VERSION);
  assert.equal(readAIConsent({ ...ctx, scope: "other" }, s), null);
  assert.equal(readAIConsent({ ...ctx, target: "local" }, s), null);
  assert.equal(readAIConsent(ctx, storage()), null);
});
test("write failure and silent write failure fail closed, including a formerly valid receipt", () => {
  for (const silent of [true, false]) {
    const ctx = context(), s = storage(); grantAIConsent(ctx, s);
    s.setItem = () => { if (!silent) throw Error("quota"); };
    assert.throws(() => grantAIConsent(ctx, s));
    assert.equal(readAIConsent(ctx, s), null);
    assert.throws(() => requireAIConsent(ctx, s, () => ctx, new AbortController().signal));
  }
});
test("storage read failures cannot authorize a request", () => {
  const ctx = context(), s = storage(); grantAIConsent(ctx, s);
  s.getItem = () => { throw Error("denied"); };
  assert.throws(() => requireAIConsent(ctx, s, () => ctx, new AbortController().signal));
});
test("revocation, changed receipt and account/target switch invalidate existing permits before fetch", async () => {
  for (const change of ["revoke", "receipt", "account", "target", "abort"]) {
    const ctx = context(), s = storage(), controller = new AbortController(); let latest = ctx, requests = 0;
    grantAIConsent(ctx, s);
    const permit = requireAIConsent(ctx, s, () => latest, controller.signal);
    if (change === "revoke") revokeAIConsent(ctx, s);
    if (change === "receipt") grantAIConsent(ctx, s);
    if (change === "account") latest = { ...ctx, scope: "other" };
    if (change === "target") latest = { ...ctx, target: "local" };
    if (change === "abort") controller.abort();
    await assert.rejects(consentedFetch(permit, async () => { requests++; return Response.json({}); })("https://example.invalid"));
    assert.equal(requests, 0, change);
  }
});
test("revoke blocks this runtime immediately even if persisted removal throws or silently fails", () => {
  for (const silent of [true, false]) {
    const ctx = context(), s = storage(); grantAIConsent(ctx, s);
    const permit = requireAIConsent(ctx, s, () => ctx, new AbortController().signal);
    s.removeItem = () => { if (!silent) throw Error("denied"); };
    assert.throws(() => revokeAIConsent(ctx, s));
    assert.equal(readAIConsent(ctx, s), null); assert.throws(() => permit.assertCurrent());
  }
});
test("cross-tab receipt removal and condition changes fail closed without waiting for a storage event", () => {
  const ctx = context(), s = storage(); grantAIConsent(ctx, s);
  const permit = requireAIConsent(ctx, s, () => ctx, new AbortController().signal);
  const receipt = JSON.parse(readAIConsent(ctx, s));
  s.setItem(consentKey(ctx), JSON.stringify({ ...receipt, version: "changed-conditions" }));
  assert.ok(aiConsentChanges(ctx, s).includes("안내 문구"));
  assert.throws(() => permit.assertCurrent());
  s.removeItem(consentKey(ctx)); assert.throws(() => permit.assertCurrent());
});
test("revocation while a response is in flight rejects the late response, and regrant requires a new permit", async () => {
  const ctx = context(), s = storage(); grantAIConsent(ctx, s);
  const permit = requireAIConsent(ctx, s, () => ctx, new AbortController().signal);
  let complete;
  const pending = consentedFetch(permit, () => new Promise(resolve => { complete = resolve; }))("https://example.invalid");
  revokeAIConsent(ctx, s); complete(Response.json({ titles: ["late"] }));
  await assert.rejects(pending, /동의나 계정/);
  grantAIConsent(ctx, s); assert.throws(() => permit.assertCurrent());
  requireAIConsent(ctx, s, () => ctx, new AbortController().signal).assertCurrent();
});
test("remote splitter also checks the permit at the actual send and after body reading", async () => {
  const ctx = context(), s = storage(), signal = new AbortController().signal; grantAIConsent(ctx, s);
  const permit = requireAIConsent(ctx, s, () => ctx, signal); let requests = 0;
  await assert.rejects(splitWithRemoteAI("합성 문장", signal, "synthetic", { assertCurrent() { throw Error("동의 없음"); } }, async () => { requests++; }));
  assert.equal(requests, 0);
  await assert.rejects(splitWithRemoteAI("합성 문장", signal, "synthetic", permit, async () => {
    requests++;
    return { ok: true, async text() { revokeAIConsent(ctx, s); return JSON.stringify({ titles: ["late"] }); } };
  }), /동의나 계정/);
  assert.equal(requests, 1);
});
test("a recipient, field, purpose, model or retention fact change requires consent even if notice version was not manually bumped", () => {
  const labels = { endpoint: "전송 주소", recipient: "받는 곳", fields: "전송 항목", purpose: "처리 목적", model: "AI 모델", retention: "로그·보관 안내" };
  for (const [key, label] of Object.entries(labels)) {
    const ctx = context(), s = storage(); grantAIConsent(ctx, s);
    const before = AI_PROCESSING_FACTS.gateway[key];
    try { AI_PROCESSING_FACTS.gateway[key] = "changed fixture"; assert.equal(readAIConsent(ctx, s), null); assert.ok(aiConsentChanges(ctx, s).includes(label)); }
    finally { AI_PROCESSING_FACTS.gateway[key] = before; }
  }
});
