import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createVapidKeys, base64url, validPushPoint } from "../supabase/functions/_shared/push-subscription.ts";
// Only synthetic endpoint paths/keys are registered. This test sends no push.
const root = "https://synxmskamifpovuziecx.supabase.co", key = "sb_publishable_ACwZjSLbL_dU9hilmAV7CQ_FEH8AT29";
const users = JSON.parse(readFileSync(new URL("../.sync-auth-fixture.json", import.meta.url), "utf8"));
assert.equal(users.length, 2); assert.ok(users.every(u => u.email.endsWith("@example.invalid") && u.marker.startsWith("oddk-verification-")));
const clients = users.map(() => createClient(root, key, { auth: { persistSession: false, autoRefreshToken: false } }));
const sessions = await Promise.all(clients.map(async (client, i) => { const { data, error } = await client.auth.signInWithPassword({ email: users[i].email, password: users[i].password }); assert.equal(error, null); return data.session; }));
const devices = [];
async function device() {
  const keys = await createVapidKeys();
  const value = { installationId: randomUUID(), deviceToken: randomBytes(32).toString("base64url"), subscription: { endpoint: `https://fcm.googleapis.com/fcm/send/oddk-QA-never-send-${randomUUID()}`, keys: { p256dh: keys.publicKey, auth: randomBytes(16).toString("base64url") } } };
  devices.push(value); return value;
}
const proof = d => ({ installationId: d.installationId, deviceToken: d.deviceToken });
const reg = (d, revision, label = "QA browser") => ({ action: "register", ...proof(d), subscription: d.subscription, revision, label });
async function api(body, expected = 200, account = 0, overrides = {}) {
  const response = await fetch(`${root}/functions/v1/push-subscriptions`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${sessions[account].access_token}`, ...overrides }, body: JSON.stringify(body) });
  const result = await response.json(); if (expected !== null) assert.equal(response.status, expected, result.error);
  const text = JSON.stringify(result); assert.equal(Object.hasOwn(result, "privateKey"), false); assert.equal(Object.hasOwn(result, "endpoint"), false);
  for (const d of devices) assert.equal(text.includes(d.deviceToken), false);
  return expected === null ? { status: response.status, body: result } : result;
}
async function state(d, account = 0) { return api({ action: "status", ...proof(d) }, 200, account); }
try {
  const beforePlans = await Promise.all(clients.map(c => c.from("account_plans").select("plan,version,updated_at").maybeSingle()));
  const pub = await Promise.all([api({ action: "config" }), api({ action: "config" }, 200, 1)]);
  assert.deepEqual(pub[0], pub[1]); assert.deepEqual(Object.keys(pub[0]), ["publicKey"]); assert.equal(await validPushPoint(pub[0].publicKey), true);
  await api({ action: "config" }, 401, 0, { authorization: "Bearer invalid" });
  await api({ action: "config" }, 403, 0, { origin: "https://evil.invalid" });
  const d = await device(); assert.deepEqual(await state(d), { revision: 0, enabled: false, owned: false, label: null });
  assert.deepEqual(await api({ action: "disable", ...proof(d), revision: 0 }), { revision: 1, enabled: false, owned: true, label: "이 브라우저" });
  assert.equal((await api(reg(d, 0), 409)).code, "stale");
  assert.deepEqual(await api(reg(d, 1, "A browser")), { revision: 2, enabled: true, owned: true, label: "A browser" });
  assert.equal((await api(reg(d, 2, "A browser"))).revision, 2); // Heartbeat is a no-op.
  const firstList = (await api({ action: "devices" })).devices; assert.equal(firstList.length, 1);
  assert.deepEqual(Object.keys(firstList[0]).sort(), ["installationId", "revision", "label", "enabled", "updatedAt"].sort()); assert.equal(firstList[0].installationId, d.installationId);
  assert.deepEqual(await api({ action: "devices" }, 200, 1), { devices: [] });
  await api({ action: "revoke", installationId: d.installationId, revision: 2 }, 409, 1);
  const wrongToken = randomBytes(32).toString("base64url");
  for (const action of ["status", "disable", "register"]) {
    const body = action === "register" ? { ...reg(d, 2), deviceToken: wrongToken } : { action, ...proof(d), deviceToken: wrongToken, ...(action === "disable" ? { revision: 2 } : {}) };
    await api(body, 409, 1);
  }
  assert.deepEqual(await state(d, 1), { revision: 2, enabled: false, owned: false, label: null });
  await api({ action: "disable", ...proof(d), revision: 2 }, 409, 1);
  assert.equal((await state(d)).enabled, true);
  assert.equal((await api(reg(d, 2, "B browser"), 200, 1)).revision, 3);
  assert.deepEqual(await api({ action: "devices" }), { devices: [] }); assert.equal((await api({ action: "devices" }, 200, 1)).devices[0].label, "B browser");
  await api({ action: "revoke", installationId: d.installationId, revision: 3 }, 409);
  await api(reg(d, 2), 409); await api({ action: "disable", ...proof(d), revision: 2 }, 409);
  assert.deepEqual(await state(d), { revision: 3, enabled: false, owned: false, label: null });
  const stolen = await device(); stolen.subscription = d.subscription;
  assert.equal((await api(reg(stolen, 0), 409)).code, "endpoint");
  assert.equal((await api(reg(d, 3, "A restored"))).revision, 4);
  await api({ action: "disable", ...proof(d), revision: 3 }, 409, 1);
  const race = await Promise.all([api(reg(d, 4, "First intent"), null), api(reg(d, 4, "Second intent"), null)]);
  assert.deepEqual(race.map(r => r.status).sort(), [200, 409]); assert.equal(race.find(r => r.status === 409).body.code, "stale");
  assert.equal((await state(d)).revision, 5);
  assert.equal((await api({ action: "revoke", installationId: d.installationId, revision: 5 })).revision, 6);
  assert.equal((await state(d)).enabled, false); await api(reg(d, 5), 409);
  assert.equal((await api({ action: "revoke", installationId: d.installationId, revision: 6 })).revision, 6);
  assert.equal((await api(reg(d, 6))).revision, 7);

  const more = []; for (let i = 0; i < 3; i++) { const n = await device(); more.push(n); await api(reg(n, 0)); }
  const last = [await device(), await device()];
  const lastRace = await Promise.all(last.map(async n => {
    const r = await fetch(`${root}/functions/v1/push-subscriptions`, { method: "POST", headers: { authorization: `Bearer ${sessions[0].access_token}`, "content-type": "application/json" }, body: JSON.stringify(reg(n, 0)) });
    return { status: r.status, body: await r.json(), device: n };
  }));
  assert.deepEqual(lastRace.map(r => r.status).sort(), [200, 429]);
  const denied = lastRace.find(r => r.status === 429); assert.equal(denied.body.code, "limit");
  const disabled = more[0]; await api({ action: "disable", ...proof(disabled), revision: 1 });
  assert.equal((await api(reg(denied.device, 0))).enabled, true);

  const invalid = new Uint8Array(65); invalid[0] = 4;
  await api({ ...reg(d, 5), subscription: { ...d.subscription, keys: { ...d.subscription.keys, p256dh: base64url(invalid) } } }, 400);
  await api({ ...reg(d, 5), subscription: { ...d.subscription, endpoint: "https://127.0.0.1/forbidden-push-test" } }, 400);
  await api({ ...reg(d, 5), userId: users[1].id }, 400);

  // Six A-owned records exist (five active, one disabled); fill recent history.
  for (let i = 0; i < 14; i++) { const n = await device(); await api({ action: "disable", ...proof(n), revision: 0 }); }
  const overHistory = await device(); assert.equal((await api({ action: "disable", ...proof(overHistory), revision: 0 }, 429)).code, "history");
  const rpc = [
    ["push_vapid_ensure", { p_public: pub[0].publicKey, p_private: "a".repeat(43) }], ["push_vapid_get", {}],
    ["push_device_list", { p_user: users[0].id }], ["push_device_revoke", { p_user: users[0].id, p_installation: d.installationId, p_revision: 7 }],
    ["push_device_status", { p_user: users[0].id, p_installation: d.installationId, p_binding: "a".repeat(64) }],
    ["push_device_disable", { p_user: users[0].id, p_installation: d.installationId, p_binding: "a".repeat(64), p_revision: 5 }],
    ["push_device_register", { p_user: users[0].id, p_installation: d.installationId, p_binding: "a".repeat(64), p_revision: 5, p_label: "forged", p_endpoint: d.subscription.endpoint, p_endpoint_hash: "a".repeat(64), p_p256dh: d.subscription.keys.p256dh, p_auth: d.subscription.keys.auth }],
    ["push_project_reminders", { p_plan: {} }], ["push_seed_deliveries", { p_user: users[0].id }],
    ["push_sync_reminders", { p_user: users[0].id, p_plan: {} }], ["push_delivery_claim", { p_limit: 5 }],
    ["push_delivery_current", { p_id: d.installationId, p_lease: d.installationId }],
    ["push_delivery_finish", { p_id: d.installationId, p_lease: d.installationId, p_outcome: "sent", p_retry_seconds: 30 }],
    ["push_delivery_receipt", { p_id: d.installationId, p_receipt_hash: "a".repeat(64), p_binding_hash: "a".repeat(64), p_action: "check" }],
    ["push_worker_claim", { p_hash: "a".repeat(64) }], ["push_worker_deliveries", { p_worker: d.installationId }],
    ["push_worker_current", { p_worker: d.installationId, p_id: d.installationId, p_lease: d.installationId }],
    ["push_worker_finish", { p_lease: d.installationId, p_result: {} }], ["push_worker_dispatch", {}],
    ["push_receipt_authorize", { p_id: d.installationId, p_receipt_hash: "a".repeat(64), p_binding_hash: "a".repeat(64), p_installation: d.installationId, p_user: users[0].id, p_revision: 1, p_action: "check" }],
  ];
  for (const client of clients) {
    for (const [name, args] of rpc) assert.equal((await client.rpc(name, args)).error?.code, "42501", name);
    for (const table of ["push_settings", "push_subscriptions", "push_reminders", "push_deliveries", "push_worker_state"]) assert.equal((await client.from(table).select("*")).error?.code, "42501", table);
  }
  assert.deepEqual(await Promise.all(clients.map(c => c.from("account_plans").select("plan,version,updated_at").maybeSingle())), beforePlans);
  console.log("PASS: VAPID public-only bootstrap stable across two accounts; device proof/owner transfer/CAS/no-op/disable-before-create; owner-only device lists/remote revoke/stale rejection; concurrent five-device cap/recent-history cap; invalid point/host/owner rejected; private tables/RPC denied; account plans unchanged; no push sent.");
} finally {
  // Deactivate every synthetic subscription even if an assertion failed.
  for (const d of devices) for (let a = 0; a < clients.length; a++) {
    try { const s = await state(d, a); if (s.owned && s.enabled) await api({ action: "disable", ...proof(d), revision: s.revision }, 200, a); } catch { /* Admin fixture deletion is the final cleanup guard. */ }
  }
  await Promise.all(clients.map(c => c.auth.signOut()));
}
