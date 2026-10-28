import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import ts from "typescript";
import { readFileSync } from "node:fs";
import { base64url, createVapidKeys, parsePushSubscriptionRequest } from "../../supabase/functions/_shared/push-subscription.ts";

const source = readFileSync(new URL("../../app/todo/push-client.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const keys = await createVapidKeys();
const copy = value => JSON.parse(JSON.stringify(value));
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function harness() {
  const scope = "https://example.invalid/oddk-todo/";
  const h = { user: id(1), calls: [], permission: "default", promptCount: 0, exists: false, subscribed: false, offline: false, server: { revision: 0, enabled: false, owned: false, label: null }, state: { installationId: id(3), deviceToken: "A".repeat(43), epoch: id(4), userId: null, revision: 0, enabled: false, seen: [] }, generation: 4 };
  class Channel {
    constructor() { this.port1 = { close() {} }; this.port2 = { deliver: data => this.port1.onmessage?.({ data }) }; }
  }
  const publicBytes = Uint8Array.from(atob(keys.publicKey.replaceAll("-", "+").replaceAll("_", "/")), c => c.charCodeAt(0));
  const subscription = {
    options: { applicationServerKey: publicBytes.buffer },
    toJSON: () => ({ endpoint: `https://fcm.googleapis.com/fcm/send/oddk-test-only-${id(3)}`, expirationTime: null, keys: { p256dh: keys.publicKey, auth: base64url(new Uint8Array(16)) } }),
    unsubscribe: async () => { h.calls.push("unsubscribe"); h.subscribed = false; return true; },
  };
  const active = { scriptURL: new URL("oddk-push-sw.js", scope).href, state: "activated", postMessage(body, ports) {
    queueMicrotask(async () => {
      h.calls.push(`sw:${body.action}`); await h.messageIntercept?.(body);
      if (body.action === "bind" || body.action === "block") {
        if (body.epoch !== undefined && body.epoch !== h.state.epoch) { ports[0].deliver({ ok: false }); return; }
        h.state = { ...h.state, enabled: body.action === "bind", userId: body.action === "bind" ? body.userId : null, epoch: id(++h.generation), revision: body.action === "bind" ? body.revision : h.state.revision };
      }
      ports[0].deliver({ ok: true, state: copy(h.state) });
    });
  } };
  const registration = { scope, active, pushManager: {
    getSubscription: async () => h.subscribed ? subscription : null,
    subscribe: async options => { h.calls.push("subscribe"); assert.equal(options.userVisibleOnly, true); assert.deepEqual([...options.applicationServerKey], [...publicBytes]); h.subscribed = true; return subscription; },
  } };
  const notification = { get permission() { return h.permission; }, requestPermission: () => { h.promptCount++; h.calls.push("permission"); h.permission = h.nextPermission ?? "granted"; return Promise.resolve(h.permission); } };
  const navigator = { serviceWorker: { getRegistration: async value => { assert.equal(value, scope); return h.exists ? registration : undefined; }, register: async (url, options) => { h.calls.push("register-worker"); assert.equal(url, active.scriptURL); assert.equal(options.scope, scope); assert.equal(options.updateViaCache, "none"); h.exists = true; return registration; } } };
  const client = { auth: { getSession: async () => ({ data: { session: h.user ? { user: { id: h.user }, access_token: "synthetic" } : null } }) } };
  const exports = {};
  vm.runInNewContext(js, { exports, require: () => ({ syncClient: () => client }), window: { isSecureContext: true, location: { origin: "https://example.invalid" }, Notification: notification, PushManager: {} }, navigator, Notification: notification, URL, MessageChannel: Channel, Uint8Array, atob, AbortSignal, setTimeout, clearTimeout, process: { env: { NEXT_PUBLIC_BASE_PATH: "/oddk-todo" } },
    fetch: async (_url, options) => {
      const body = JSON.parse(options.body); h.calls.push(`api:${body.action}`);
      if (h.offline) throw new Error("offline");
      assert.ok(parsePushSubscriptionRequest(body), "real strict server parser accepts the browser request including projected subscription JSON");
      const intercepted = await h.apiIntercept?.(body); if (intercepted) return intercepted;
      let result;
      if (body.action === "config") result = { publicKey: keys.publicKey };
      if (body.action === "status") result = h.server;
      if (body.action === "register") { if (body.revision !== h.server.revision) return Response.json({ error: "stale" }, { status: 409 }); h.server = { revision: h.server.revision + 1, enabled: true, owned: true, label: body.label }; result = h.server; }
      if (body.action === "disable") { h.server = { ...h.server, revision: h.server.revision + 1, enabled: false }; result = h.server; }
      if (body.action === "devices") result = { devices: h.server.enabled ? [{ installationId: id(3), revision: h.server.revision, label: "Synthetic", enabled: true, updatedAt: "2026-10-28T00:00:00Z" }] : [] };
      if (body.action === "revoke") { h.server = { ...h.server, revision: h.server.revision + 1, enabled: false }; result = h.server; }
      return Response.json(result);
    },
  });
  h.client = exports; h.subscription = subscription; h.registration = registration; return h;
}
test("initial inspect and account alignment never request permission, register a worker, or subscribe", async () => {
  const h = harness(); assert.equal((await h.client.inspectPush(h.user)).enabled, false); await h.client.alignPushBinding(h.user); await h.client.clearPushBinding();
  assert.equal(h.promptCount, 0); assert.equal(h.exists, false); assert.deepEqual(h.calls, []);
});
test("explicit enable requests permission immediately and binds only the server-confirmed device under the Pages scope", async () => {
  const h = harness(); const work = h.client.enablePush(h.user); assert.equal(h.calls[0], "permission"); await work;
  assert.equal(h.state.enabled, true); assert.equal(h.state.userId, h.user); assert.equal(h.state.revision, h.server.revision); assert.equal(h.promptCount, 1);
  assert.ok(h.calls.indexOf("api:register") < h.calls.indexOf("sw:bind")); assert.equal((await h.client.inspectPush(h.user)).enabled, true);
  assert.equal((await h.client.pushDevices(h.user)).length, 1);
});
test("denied/dismissed permissions never create a subscription or send an API request", async () => {
  for (const permission of ["denied", "default"]) { const h = harness(); h.nextPermission = permission; await assert.rejects(h.client.enablePush(h.user)); assert.equal(h.exists, false); assert.deepEqual(h.calls, ["permission"]); }
});
test("logout blocks locally before unsubscribe or server cleanup and stays blocked when offline", async () => {
  const h = harness(); await h.client.enablePush(h.user); h.calls.length = 0; h.offline = true;
  await h.client.stopPushForLogout(h.user); assert.equal(h.state.enabled, false); assert.equal(h.state.userId, null);
  assert.ok(h.calls.indexOf("sw:block") < h.calls.indexOf("unsubscribe")); assert.ok(h.calls.indexOf("sw:block") < h.calls.indexOf("api:status"));
});
test("changed accounts and late enable responses never reactivate an old binding", async () => {
  const h = harness(); h.apiIntercept = body => { if (body.action === "register") { h.user = id(9); h.state = { ...h.state, epoch: id(20), userId: null, enabled: false }; } };
  await assert.rejects(h.client.enablePush(id(1)), /계정/); assert.equal(h.state.enabled, false); assert.equal(h.calls.includes("sw:bind"), false);
  h.calls.length = 0; await assert.rejects(h.client.inspectPush(id(1)), /계정/); assert.deepEqual(h.calls, []);
  const late = harness(); late.messageIntercept = body => { if (body.action === "bind") late.state.epoch = id(30); };
  await assert.rejects(late.client.enablePush(late.user)); assert.equal(late.state.enabled, false);
});
test("remote revoke, denied browser permission and account alignment remove local eligibility without requesting permission", async () => {
  const h = harness(); await h.client.enablePush(h.user); const [device] = await h.client.pushDevices(h.user);
  await h.client.revokePushDevice(h.user, device, device.installationId); assert.equal(h.state.enabled, false); assert.equal(h.server.enabled, false); assert.equal(h.subscribed, false);
  await h.client.enablePush(h.user); h.permission = "denied"; assert.equal((await h.client.inspectPush(h.user)).enabled, false); assert.equal(h.state.enabled, false);
  h.permission = "granted"; await h.client.enablePush(h.user); await h.client.alignPushBinding(id(9)); assert.equal(h.state.enabled, true); h.user = id(9); await h.client.alignPushBinding(h.user); assert.equal(h.state.enabled, false); assert.equal(h.promptCount, 1);
});
