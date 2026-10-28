import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createVapidKeys } from "../supabase/functions/_shared/push-subscription.ts";
const url = "https://synxmskamifpovuziecx.supabase.co", key = "sb_publishable_ACwZjSLbL_dU9hilmAV7CQ_FEH8AT29";
const users = JSON.parse(readFileSync(new URL("../.sync-auth-fixture.json", import.meta.url), "utf8"));
assert.equal(users.length, 2); assert.ok(users.every(u => u.email.endsWith("@example.invalid") && u.marker.startsWith("oddk-verification-")));
const clients = users.map(() => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }));
const sessions = await Promise.all(clients.map(async (c, i) => { const { data, error } = await c.auth.signInWithPassword({ email: users[i].email, password: users[i].password }); assert.equal(error, null); return data.session; }));
const fixturePath = new URL("../.sync-test-runtime/receipt-fixture.json", import.meta.url), claimsPath = new URL("../.sync-test-runtime/receipt-claims.json", import.meta.url);
async function accountApi(name, body, account = 0, expected = 200) {
  const r = await fetch(`${url}/functions/v1/${name}`, { method: "POST", headers: { authorization: `Bearer ${sessions[account].access_token}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await r.json(); assert.equal(r.status, expected, data.error); return data;
}
const korean = instant => new Date(instant + 9 * 3600000).toISOString();
try {
  if (process.argv[2] === "prepare") {
    const start = Math.floor(Date.now() / 60000) * 60000 + 60000, finish = start + 3600000;
    const localStart = korean(start), localEnd = korean(finish), receiver = await createVapidKeys();
    const task = { id: "receipt-task", title: "Receipt first title", notes: "Never return this private note", done: false, priority: "normal", plannedDate: localStart.slice(0, 10), startTime: localStart.slice(11, 16), endDate: localEnd.slice(0, 10), endTime: localEnd.slice(11, 16), endDayOffset: localStart.slice(0, 10) === localEnd.slice(0, 10) ? 0 : 1, minutes: 60, bufferMinutes: 10, reminderMinutes: 0 };
    const empty = { schemaVersion: 5, tasks: [], start: "09:00", reviewsByDate: {}, goalTree: { goal: "Receipt QA", groups: [] } };
    const first = await accountApi("plan-sync", { action: "ensure", plan: empty }), other = await accountApi("plan-sync", { action: "ensure", plan: empty }, 1);
    const saved = await accountApi("plan-sync", { action: "push", version: first.version, plan: { ...empty, schemaVersion: 6, tasks: [task] } });
    const device = { installationId: randomUUID(), deviceToken: randomBytes(32).toString("base64url"), subscription: { endpoint: `https://fcm.googleapis.com/fcm/send/oddk-QA-receipt-never-send-${randomUUID()}`, keys: { p256dh: receiver.publicKey, auth: randomBytes(16).toString("base64url") } } };
    const registered = await accountApi("push-subscriptions", { action: "register", ...device, revision: 0, label: "Receipt fixture" });
    writeFileSync(fixturePath, JSON.stringify({ userId: users[0].id, otherId: users[1].id, start, task, plan: saved.plan, version: saved.version, device, revision: registered.revision, other }), { mode: 0o600 });
    console.log("Prepared one next-minute synthetic reminder and device. Admin claims it early and holds its lease; no provider message is needed for receipt verification.");
  } else if (process.argv[2] === "verify") {
    const fixture = JSON.parse(readFileSync(fixturePath, "utf8")), claims = JSON.parse(readFileSync(claimsPath, "utf8"));
    assert.equal(fixture.userId, users[0].id); assert.equal(claims.length, 1); const claim = claims[0]; assert.equal(claim.userId, users[0].id); assert.equal(claim.installationId, fixture.device.installationId);
    const current = await accountApi("plan-sync", { action: "pull" });
    fixture.plan = current.plan; fixture.version = current.version; fixture.task = current.plan.tasks.find(t => t.id === claim.taskId); fixture.start = Date.parse(claim.startAt); fixture.revision = claim.revision;
    assert.ok(fixture.task);
    const proof = { action: "check", deliveryId: claim.id, receiptToken: claim.receiptToken, userId: fixture.userId, installationId: fixture.device.installationId, deviceToken: fixture.device.deviceToken, revision: fixture.revision };
    let serverOffset = 0;
    async function receipt(body = proof, expected = 200) {
      const r = await fetch(`${url}/functions/v1/push-receipt`, { method: "POST", headers: { "content-type": "application/json", origin: "https://seonyoungyoo16.github.io" }, body: JSON.stringify(body) });
      const serverDate = Date.parse(r.headers.get("date")); assert.ok(Number.isFinite(serverDate)); serverOffset = serverDate - Date.now();
      const data = await r.json(); if (expected !== null) assert.equal(r.status, expected, data.error); assert.equal(r.headers.get("cache-control"), "no-store");
      assert.equal(JSON.stringify(data).includes(fixture.task.notes), false); assert.equal(JSON.stringify(data).includes(fixture.device.deviceToken), false); return expected === null ? { status: r.status, data } : data;
    }
    const initial = await receipt(proof, null);
    if (Date.now() + serverOffset < fixture.start) assert.equal(initial.status, 410);
    // The deployment clock is authoritative; a test machine can be seconds
    // ahead. Allow one extra second for the HTTP Date header's resolution.
    while (Date.now() + serverOffset < fixture.start + 1000) await new Promise(resolve => setTimeout(resolve, Math.min(1000, fixture.start + 1000 - Date.now() - serverOffset)));
    for (const patch of [{ userId: fixture.otherId }, { revision: fixture.revision + 1 }, { installationId: randomUUID() }, { receiptToken: "f".repeat(64) }, { deviceToken: randomBytes(32).toString("base64url") }]) {
      await receipt({ ...proof, ...patch }, 410); await receipt({ ...proof, ...patch, action: "ack" }, 410);
    }
    let data = await receipt(); assert.equal(data.displayed, false); assert.equal(data.title, fixture.task.title); assert.deepEqual(Object.keys(data).sort(), ["displayed", "title", "date", "startAt", "expiresAt"].sort());
    let plan = fixture.plan, version = fixture.version;
    async function save(next) { const saved = await accountApi("plan-sync", { action: "push", plan: next, version }); plan = saved.plan; version = saved.version; }
    await save({ ...plan, tasks: plan.tasks.map(t => ({ ...t, title: "Receipt updated title" })) }); data = await receipt(); assert.equal(data.title, "Receipt updated title");
    assert.deepEqual(await receipt({ ...proof, action: "ack" }), { ok: true }); assert.deepEqual(await receipt(), { displayed: true });
    await save({ ...plan, tasks: plan.tasks.map(t => ({ ...t, done: true })) }); await receipt(proof, 410);
    await save({ ...plan, tasks: plan.tasks.map(t => ({ ...t, done: false })) }); assert.deepEqual(await receipt(), { displayed: true });
    const originalTask = plan.tasks[0], shifted = fixture.start + 15 * 60000, shiftedEnd = shifted + 3600000;
    await save({ ...plan, tasks: [{ ...originalTask, plannedDate: korean(shifted).slice(0, 10), startTime: korean(shifted).slice(11, 16), endDate: korean(shiftedEnd).slice(0, 10), endTime: korean(shiftedEnd).slice(11, 16), endDayOffset: korean(shifted).slice(0, 10) === korean(shiftedEnd).slice(0, 10) ? 0 : 1 }] });
    await receipt(proof, 410); await save({ ...plan, tasks: [] }); await receipt(proof, 410); await save({ ...plan, tasks: [originalTask] }); assert.deepEqual(await receipt(), { displayed: true });
    const transferred = await accountApi("push-subscriptions", { action: "register", ...fixture.device, revision: fixture.revision, label: "Receipt other owner" }, 1); assert.equal(transferred.revision, fixture.revision + 1); await receipt(proof, 410);
    await accountApi("push-subscriptions", { action: "disable", installationId: fixture.device.installationId, deviceToken: fixture.device.deviceToken, revision: transferred.revision }, 1);
    assert.deepEqual(await accountApi("plan-sync", { action: "pull" }, 1), fixture.other);
    await save({ ...plan, tasks: [] });
    console.log("PASS: live receipt before-due/owner/revision/installation/token/proof checks; minimal latest title; ACK/dedupe; complete/undo/retime/delete/rebind; other account unchanged. Synthetic DB lease only; no physical push receipt claimed.");
  } else throw new Error("Use prepare or verify; trusted admin claim is a separate step.");
} finally { await Promise.all(clients.map(c => c.auth.signOut())); }
