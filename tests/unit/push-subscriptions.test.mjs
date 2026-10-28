import test from "node:test";
import assert from "node:assert/strict";
import { base64url, decodeBase64url, createVapidKeys, isPushEndpoint, parsePushSubscriptionRequest, validPushPoint, sha256 } from "../../supabase/functions/_shared/push-subscription.ts";
import { handlePushSubscription } from "../../supabase/functions/push-subscriptions/handler.ts";
const user = "00000000-0000-4000-8000-000000000001", installationId = "00000000-0000-4000-8000-000000000002";
const deviceToken = base64url(new Uint8Array(32).fill(2)), endpoint = "https://fcm.googleapis.com/fcm/send/QA_only_not_sent";
const keys = await createVapidKeys();
const device = { installationId, deviceToken };
const registration = { action: "register", revision: 0, label: "My browser", ...device, subscription: { endpoint, keys: { p256dh: keys.publicKey, auth: base64url(new Uint8Array(16).fill(3)) } } };
const request = (body = registration, options = {}) => new Request("https://example.invalid", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer test-token", origin: "https://seonyoungyoo16.github.io", ...options.headers }, body: JSON.stringify(body) });
function fixture() {
  const calls = { auth: 0, config: 0, status: [], register: [], disable: [], devices: [], revoke: [] };
  const state = { revision: 1, owned: true, enabled: true, label: "My browser" };
  const deps = { authenticate: async token => { calls.auth++; assert.equal(token, "test-token"); return user; }, store: {
    async config() { calls.config++; return { publicKey: keys.publicKey }; },
    async devices(...args) { calls.devices.push(args); return [{ installationId, revision: 1, enabled: true, label: "Browser", updatedAt: "2026-10-28T00:00:00Z" }]; },
    async revoke(...args) { calls.revoke.push(args); return { ok: true, state: { ...state, enabled: false, revision: 2 } }; },
    async status(...args) { calls.status.push(args); return { ok: true, state }; },
    async register(...args) { calls.register.push(args); return { ok: true, state }; },
    async disable(...args) { calls.disable.push(args); return { ok: true, state: { ...state, enabled: false, revision: 2 } }; },
  } };
  return { calls, deps, state };
}

test("canonical base64url length and real uncompressed P256 public points are required", async () => {
  assert.equal(decodeBase64url(deviceToken, 32)?.length, 32);
  for (const bad of [deviceToken + "=", deviceToken.slice(0, -1) + "J", "a".repeat(44), "a".repeat(42), null, "a+b/c"]) assert.equal(decodeBase64url(bad, 32), null);
  assert.equal(keys.publicKey.length, 87); assert.equal(keys.privateKey.length, 43); assert.equal(await validPushPoint(keys.publicKey), true);
  const invalid = new Uint8Array(65); invalid[0] = 4;
  assert.equal(await validPushPoint(base64url(invalid)), false);
  assert.equal(await validPushPoint("bad"), false);
});

test("push endpoint allowlist rejects arbitrary hosts, redirects via credentials, encoded paths, ports, queries and noncanonical URLs", () => {
  for (const good of [endpoint, "https://updates.push.services.mozilla.com/wpush/v2/QA_not_sent-a:b", "https://web.push.apple.com/QA_not_sent-a:b"]) assert.equal(isPushEndpoint(good), true, good);
  for (const bad of ["http://fcm.googleapis.com/fcm/send/QA_only_not_sent", "https://fcm.googleapis.com.evil.invalid/fcm/send/QA_only_not_sent", "https://fcm.googleapis.com@evil.invalid/fcm/send/QA_only_not_sent", "https://fcm.googleapis.com:444/fcm/send/QA_only_not_sent", endpoint + "?redirect=http://127.0.0.1", endpoint + "#fragment", endpoint.replace("QA_only", "%51A_only"), endpoint.replace("https://", "https://user:pass@"), endpoint.replace("fcm.googleapis", "FCM.googleapis"), "https://127.0.0.1/fcm/send/QA_only_not_sent", endpoint + "/../QA_other", endpoint + "\\evil", "https://web.push.apple.com/", endpoint.replace("/fcm/send/", "/arbitrary/")]) assert.equal(isPushEndpoint(bad), false, bad);
});

test("request parser preserves revision zero, normalizes labels, rejects foreign owner fields and ignores no secret fields", () => {
  assert.deepEqual(parsePushSubscriptionRequest(registration), registration);
  assert.equal(parsePushSubscriptionRequest({ ...registration, label: "  Browser  " }).label, "Browser");
  assert.deepEqual(parsePushSubscriptionRequest({ action: "config" }), { action: "config" });
  assert.equal(parsePushSubscriptionRequest({ action: "status", ...device }).action, "status");
  assert.equal(parsePushSubscriptionRequest({ action: "disable", revision: 0, ...device }).revision, 0);
  for (const bad of [{ ...registration, userId: user }, { ...registration, installationId: "bad" }, { ...registration, deviceToken: "a" }, { ...registration, revision: -1 }, { ...registration, revision: Number.MAX_SAFE_INTEGER }, { ...registration, label: " " }, { ...registration, label: "bad\nlabel" }, { ...registration, label: "a".repeat(61) }, { ...registration, subscription: { ...registration.subscription, expirationTime: null } }, { ...registration, subscription: { ...registration.subscription, keys: { ...registration.subscription.keys, extra: "secret" } } }, { action: "config", extra: true }, { action: "status", ...device, revision: 1 }, { action: "disable", ...device }, null, []]) assert.equal(parsePushSubscriptionRequest(bad), null);
});

test("origin/method/content-type/auth are checked before private configuration or any device access", async () => {
  const { deps, calls } = fixture();
  const requests = [request(registration, { headers: { origin: "https://evil.invalid" } }), new Request("https://example.invalid"), request(registration, { headers: { "content-type": "text/plain" } }), request(registration, { headers: { authorization: "" } }), request(registration, { headers: { authorization: "Bearer token space" } })];
  const status = []; for (const req of requests) status.push((await handlePushSubscription(req, deps)).status);
  assert.deepEqual(status, [403, 405, 415, 401, 401]); assert.equal(calls.auth, 0); assert.equal(calls.config, 0); assert.equal(calls.register.length, 0);
  const preflight = await handlePushSubscription(new Request("https://example.invalid", { method: "OPTIONS", headers: { origin: "http://127.0.0.1:3200" } }), deps);
  assert.equal(preflight.status, 204); assert.equal(preflight.headers.get("Access-Control-Allow-Origin"), "http://127.0.0.1:3200");
});

test("expired user and malformed/oversized/invalid EC payloads cannot register or read key configuration", async () => {
  const { deps, calls } = fixture(); deps.authenticate = async () => null;
  assert.equal((await handlePushSubscription(request({ action: "config" }), deps)).status, 401); assert.equal(calls.config, 0);
  deps.authenticate = async () => user;
  assert.equal((await handlePushSubscription(request({ ...registration, label: "가".repeat(3000) }), deps)).status, 413);
  const invalid = new Uint8Array(65); invalid[0] = 4;
  assert.equal((await handlePushSubscription(request({ ...registration, subscription: { ...registration.subscription, keys: { ...registration.subscription.keys, p256dh: base64url(invalid) } } }), deps)).status, 400);
  const raw = new Request("https://example.invalid", { method: "POST", headers: { authorization: "Bearer test-token", "content-type": "application/json" }, body: "{" });
  assert.equal((await handlePushSubscription(raw, deps)).status, 400); assert.equal(calls.register.length, 0);
});

test("authenticated user IDs and hashed device proofs are authoritative; replies contain no subscription secrets", async () => {
  const { deps, calls, state } = fixture();
  const response = await handlePushSubscription(request(), deps), body = await response.json();
  assert.equal(response.status, 200); assert.deepEqual(body, state); assert.equal(response.headers.get("Cache-Control"), "no-store");
  const [owner, installation, hash, revision, label, subscription, endpointHash] = calls.register[0];
  assert.equal(owner, user); assert.equal(installation, installationId); assert.equal(hash, await sha256(`${installationId}:${deviceToken}`)); assert.equal(revision, 0); assert.equal(label, registration.label); assert.deepEqual(subscription, registration.subscription); assert.equal(endpointHash, await sha256(endpoint));
  const text = JSON.stringify(body); for (const secret of [deviceToken, endpoint, registration.subscription.keys.auth, keys.privateKey]) assert.equal(text.includes(secret), false);
  deps.store.config = async () => ({ publicKey: keys.publicKey, privateKey: keys.privateKey });
  const config = await (await handlePushSubscription(request({ action: "config" }), deps)).json(); assert.deepEqual(config, { publicKey: keys.publicKey });
  deps.store.status = async () => ({ ok: true, state: { ...state, endpoint, privateKey: keys.privateKey } });
  assert.deepEqual(await (await handlePushSubscription(request({ action: "status", ...device }), deps)).json(), state);
});

test("status/disable use the same private binding with revision and never call registration", async () => {
  const { deps, calls } = fixture();
  const s = await handlePushSubscription(request({ action: "status", ...device }), deps); assert.equal(s.status, 200);
  const d = await handlePushSubscription(request({ action: "disable", revision: 3, ...device }), deps); assert.equal(d.status, 200); assert.equal((await d.json()).enabled, false);
  assert.deepEqual(calls.disable[0], [user, installationId, await sha256(`${installationId}:${deviceToken}`), 3]); assert.equal(calls.register.length, 0);
});

test("account device listing returns safe summaries and remote revoke requires a current revision without exposing a proof", async () => {
  const { deps, calls } = fixture();
  deps.store.devices = async owner => { calls.devices.push([owner]); return [{ installationId, revision: 1, enabled: true, label: "Browser", updatedAt: "2026-10-28T00:00:00Z", endpoint, deviceToken }]; };
  const response = await handlePushSubscription(request({ action: "devices" }), deps); assert.equal(response.status, 200);
  const devices = await response.json(); assert.deepEqual(Object.keys(devices.devices[0]).sort(), ["installationId", "revision", "enabled", "label", "updatedAt"].sort()); assert.deepEqual(calls.devices, [[user]]);
  const revoke = await handlePushSubscription(request({ action: "revoke", installationId, revision: 1 }), deps);
  assert.equal(revoke.status, 200); assert.equal((await revoke.json()).enabled, false); assert.deepEqual(calls.revoke, [[user, installationId, 1]]);
  for (const bad of [{ action: "revoke", installationId, revision: 0 }, { action: "revoke", installationId, revision: 1, userId: user }, { action: "devices", userId: user }]) assert.equal(parsePushSubscriptionRequest(bad), null);
  deps.store.devices = async () => [{ installationId: "bad", revision: 1, label: "", enabled: true, updatedAt: "now" }];
  assert.equal((await handlePushSubscription(request({ action: "devices" }), deps)).status, 503);
});

test("binding/endpoint/stale conflicts, account caps and infrastructure errors have actionable private responses", async () => {
  for (const error of ["binding", "endpoint", "stale", "limit", "history"]) {
    const { deps } = fixture(); deps.store.register = async () => ({ ok: false, error });
    const response = await handlePushSubscription(request(), deps), body = await response.json();
    assert.equal(response.status, ["limit", "history"].includes(error) ? 429 : 409); assert.equal(body.code, error); assert.equal(JSON.stringify(body).includes(endpoint), false);
  }
  const { deps } = fixture(); deps.store.register = async () => { throw new Error("sensitive DB credential or endpoint"); };
  const response = await handlePushSubscription(request(), deps); assert.equal(response.status, 503); assert.equal((await response.text()).includes("sensitive"), false);
});
