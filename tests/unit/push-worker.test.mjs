import test from "node:test";
import assert from "node:assert/strict";
import { handlePushWorker, providerOutcome } from "../../supabase/functions/push-worker/handler.ts";
import { createVapidKeys, base64url, sha256 } from "../../supabase/functions/_shared/push-subscription.ts";
import { validVapidKeys, validDeliveryClaim, deliveryPayload, parsePushPayload } from "../../supabase/functions/_shared/push-delivery.ts";
import { reminderWindow } from "../../supabase/functions/_shared/push-reminder.ts";
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const now = new Date("2026-10-28T15:00:10Z"), ticket = "a".repeat(64), vapid = await createVapidKeys();
const task = n => ({ id: `task-${n}`, title: "Never put title in provider payload", notes: "Private note", done: false, priority: "normal", plannedDate: "2026-10-29", startTime: "00:00", endTime: "01:00", endDate: "2026-10-29", endDayOffset: 0, minutes: 60, bufferMinutes: 10, reminderMinutes: 0 });
const claim = n => ({ id: id(n), lease: id(10 + n), reminderId: id(20 + n), userId: id(100), taskId: `task-${n}`, installationId: id(200), revision: 1, receiptToken: "b".repeat(64), ...reminderWindow(task(n)) });
const req = (body = { ticket }, headers = {}) => new Request("https://example.invalid", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
function fixture(count = 1) {
  const jobs = Array.from({ length: count }, (_, i) => claim(i + 1));
  const plan = { schemaVersion: 6, start: "09:00", tasks: jobs.map((_, i) => task(i + 1)), reviewsByDate: {}, goalTree: { goal: "G", groups: [] } };
  const calls = { gate: 0, keys: 0, claims: 0, current: 0, sent: [], finished: [], runs: [] }; let gateClaimed = false, didClaim = false;
  const deps = { now: () => now, store: {
    async claimRun(hash) { calls.gate++; assert.equal(hash, await sha256(ticket)); if (gateClaimed) return null; gateClaimed = true; return { id: id(999), until: new Date(now.getTime() + 45000).toISOString() }; },
    async hasWork() { return count > 0; }, async keys() { calls.keys++; return vapid; },
    async claim(worker) { assert.equal(worker, id(999)); calls.claims++; if (didClaim) return []; didClaim = true; return jobs; },
    async current(worker) { assert.equal(worker, id(999)); calls.current++; return { plan, subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/QA_only_not_sent", keys: { p256dh: vapid.publicKey, auth: base64url(new Uint8Array(16).fill(1)) } } }; },
    async finish(...args) { calls.finished.push(args); return true; }, async finishRun(worker, result) { calls.runs.push({ worker, result: { ...result } }); return true; },
  }, async send(...args) { calls.sent.push(args); return { status: 201, retryAfter: null }; } };
  return { deps, calls, jobs, plan };
}
test("VAPID key pairs and claim/payload contracts reject mismatches and extra private fields", async () => {
  assert.equal(await validVapidKeys(vapid), true); assert.equal(await validVapidKeys({ ...vapid, privateKey: (await createVapidKeys()).privateKey }), false);
  assert.equal(await validVapidKeys({ publicKey: "bad", privateKey: "bad" }), false);
  const c = claim(1); assert.equal(validDeliveryClaim(c), true); assert.deepEqual(parsePushPayload(deliveryPayload(c)), deliveryPayload(c));
  assert.equal(validDeliveryClaim({ ...c, revision: 0 }), false); assert.equal(validDeliveryClaim({ ...c, dueAt: "bad" }), false);
  assert.equal(parsePushPayload({ ...deliveryPayload(c), title: "secret" }), null); assert.equal(parsePushPayload({ ...deliveryPayload(c), expiresAt: "2026-10-29" }), null);
});
test("worker validates origin/method/type/one-use tickets before any queue or signing access", async () => {
  const { deps, calls } = fixture();
  const requests = [req({ ticket }, { origin: "https://seonyoungyoo16.github.io" }), new Request("https://example.invalid"), req({ ticket }, { "content-type": "text/plain" }), req({ ticket, extra: 1 }), req({ ticket: "x".repeat(300) })];
  const statuses = []; for (const r of requests) statuses.push((await handlePushWorker(r, deps)).status);
  assert.deepEqual(statuses, [403, 405, 415, 401, 401]); assert.equal(calls.gate, 0); assert.equal(calls.keys, 0);
  assert.equal((await handlePushWorker(req(), deps)).status, 200); assert.equal((await handlePushWorker(req(), deps)).status, 401);
});
test("empty work skips Vault/signing and malformed key pairs do not consume delivery attempts", async () => {
  const f = fixture(0); assert.equal((await handlePushWorker(req(), f.deps)).status, 200); assert.equal(f.calls.keys, 0); assert.equal(f.calls.claims, 0);
  const g = fixture(); g.deps.store.keys = async () => ({ ...vapid, privateKey: "a".repeat(43) });
  const response = await handlePushWorker(req(), g.deps); assert.equal(response.status, 503); assert.equal((await response.json()).available, false); assert.equal(g.calls.claims, 0); assert.equal(g.calls.sent.length, 0);
});
test("due sends contain a receipt only, use bounded TTL/stable collapse topic and never return secrets", async () => {
  const { deps, calls, jobs } = fixture(); const response = await handlePushWorker(req(), deps), data = await response.json();
  assert.equal(response.status, 200); assert.equal(data.sent, 1); assert.equal(calls.sent.length, 1);
  const [, , payload, ttl, topic] = calls.sent[0]; assert.deepEqual(payload, deliveryPayload(jobs[0])); assert.equal(ttl, 110); assert.equal(topic, (await sha256(jobs[0].id)).slice(0, 32));
  for (const secret of [task(1).title, task(1).notes, vapid.privateKey]) assert.equal(JSON.stringify(payload).includes(secret), false);
  for (const secret of [vapid.privateKey, jobs[0].receiptToken, jobs[0].userId]) assert.equal(JSON.stringify(data).includes(secret), false);
  assert.deepEqual(calls.finished[0].slice(0, 3), [jobs[0].id, jobs[0].lease, "sent"]);
});
test("completed/changed/deleted snapshots and invalid destinations never reach a push provider", async () => {
  for (const mode of ["gone", "completed", "retimed", "endpoint"]) {
    const f = fixture(); const original = f.deps.store.current;
    if (mode === "gone") f.deps.store.current = async () => null;
    if (mode === "completed") f.plan.tasks[0].done = true;
    if (mode === "retimed") Object.assign(f.plan.tasks[0], { startTime: "00:01", endTime: "01:01" });
    if (mode === "endpoint") f.deps.store.current = async (...args) => ({ ...await original(...args), subscription: { endpoint: "https://127.0.0.1/private", keys: {} } });
    const data = await (await handlePushWorker(req(), f.deps)).json(); assert.equal(f.calls.sent.length, 0); assert.equal(data[mode === "endpoint" ? "invalid" : "removed"], 1);
  }
});
test("provider classifications honor gone/permanent/temporary outcomes, Retry-After and expiry", () => {
  const expiry = "2026-10-28T15:02:00Z";
  for (const status of [200, 201, 204, 299]) assert.equal(providerOutcome(status, null, now, expiry).outcome, "sent");
  for (const status of [404, 410]) assert.equal(providerOutcome(status, null, now, expiry).outcome, "gone");
  for (const status of [307, 400, 401, 403, 413]) assert.equal(providerOutcome(status, null, now, expiry).outcome, "failed");
  for (const status of [0, 408, 429, 500, 503]) assert.deepEqual(providerOutcome(status, null, now, expiry), { outcome: "retry", retrySeconds: 30 });
  assert.deepEqual(providerOutcome(429, "45", now, expiry), { outcome: "retry", retrySeconds: 45 });
  assert.equal(providerOutcome(429, "3600", now, expiry).outcome, "failed");
  assert.equal(providerOutcome(503, null, new Date("2026-10-28T15:01:59Z"), expiry).outcome, "failed");
  assert.equal(providerOutcome(503, new Date(now.getTime() + 45000).toUTCString(), now, expiry).retrySeconds, 45);
});
test("provider expiry/retry/errors and a lost lease record bounded outcomes without re-sending within a run", async () => {
  for (const status of [410, 503, 403, 0]) {
    const f = fixture(); f.deps.send = async (...args) => { f.calls.sent.push(args); if (status === 0) throw new Error("private provider detail"); return { status, retryAfter: null }; };
    const data = await (await handlePushWorker(req(), f.deps)).json(); assert.equal(f.calls.sent.length, 1); assert.equal(data[status === 410 ? "gone" : status === 403 ? "failed" : "retry"], 1);
  }
  const f = fixture(); f.deps.store.finish = async () => false; const data = await (await handlePushWorker(req(), f.deps)).json(); assert.equal(data.lost, 1); assert.equal(f.calls.sent.length, 1);
});
test("runtime budget and malformed/duplicate batches stop safely while releasing the worker lease", async () => {
  const f = fixture(5); let advanced = false; f.deps.now = () => advanced ? new Date(now.getTime() + 19000) : now;
  f.deps.send = async (...args) => { advanced = true; f.calls.sent.push(args); return { status: 201, retryAfter: null }; };
  const data = await (await handlePushWorker(req(), f.deps)).json(); assert.equal(data.claimed, 5); assert.equal(f.calls.claims, 1); assert.equal(f.calls.runs.length, 1);
  for (const bad of [[claim(1), claim(1)], Array.from({ length: 6 }, (_, i) => claim(i + 1)), [{ ...claim(1), lease: "bad" }]]) {
    const g = fixture(); g.deps.store.claim = async () => bad; assert.equal((await handlePushWorker(req(), g.deps)).status, 503); assert.equal(g.calls.sent.length, 0); assert.equal(g.calls.runs.length, 1);
  }
});
test("worker lease expiry and backend errors do not claim success or expose private errors", async () => {
  const f = fixture(); f.deps.store.claimRun = async () => ({ id: id(999), until: now.toISOString() }); assert.equal((await handlePushWorker(req(), f.deps)).status, 409); assert.equal(f.calls.keys, 0);
  const g = fixture(); g.deps.store.finishRun = async () => false; assert.equal((await handlePushWorker(req(), g.deps)).status, 409);
  const h = fixture(); h.deps.store.claimRun = async () => { throw new Error("secret key"); }; const r = await handlePushWorker(req(), h.deps); assert.equal(r.status, 503); assert.equal((await r.text()).includes("secret key"), false);
});
