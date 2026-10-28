import test from "node:test";
import assert from "node:assert/strict";
import { handlePushReceipt } from "../../supabase/functions/push-receipt/handler.ts";
import { base64url, sha256 } from "../../supabase/functions/_shared/push-subscription.ts";
import { reminderWindow } from "../../supabase/functions/_shared/push-reminder.ts";
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const now = new Date("2026-10-28T15:00:10Z"), token = "a".repeat(64);
const body = { action: "check", deliveryId: id(1), receiptToken: token, userId: id(2), installationId: id(3), revision: 1, deviceToken: base64url(new Uint8Array(32).fill(4)) };
const task = { id: "task", title: "Only the current title", notes: "Never return these notes", done: false, priority: "normal", plannedDate: "2026-10-29", startTime: "00:00", endTime: "01:00", endDate: "2026-10-29", endDayOffset: 0, minutes: 60, bufferMinutes: 10, reminderMinutes: 0 };
const req = (value = body, headers = {}) => new Request("https://example.invalid", { method: "POST", headers: { "content-type": "application/json", origin: "https://seonyoungyoo16.github.io", ...headers }, body: JSON.stringify(value) });
function fixture() {
  const plan = { schemaVersion: 6, start: "09:00", tasks: [{ ...task }], reviewsByDate: {}, goalTree: { goal: "G", groups: [] } };
  const result = { plan, userId: body.userId, installationId: body.installationId, revision: 1, taskId: task.id, displayed: false, ...reminderWindow(task) }, calls = [];
  const deps = { now: () => now, store: { async authorize(...args) { calls.push(args); return result; } } };
  return { result, plan, calls, deps };
}
test("receipt validates origin/method/type/proof and byte limit before any private lookup", async () => {
  const f = fixture(); const requests = [req(body, { origin: "https://evil.invalid" }), new Request("https://example.invalid"), req(body, { "content-type": "text/plain" }), req({ ...body, receiptToken: "bad" }), req({ ...body, extra: true }), req({ ...body, deviceToken: "가".repeat(1000) })];
  const status = []; for (const r of requests) status.push((await handlePushReceipt(r, f.deps)).status);
  assert.deepEqual(status, [403, 405, 415, 400, 400, 413]); assert.equal(f.calls.length, 0);
  const options = await handlePushReceipt(new Request("https://example.invalid", { method: "OPTIONS", headers: { origin: "http://127.0.0.1:3200" } }), f.deps); assert.equal(options.status, 204);
});
test("a valid device receipt returns minimal current information and hashes both capabilities", async () => {
  const f = fixture(); const response = await handlePushReceipt(req(), f.deps), data = await response.json();
  assert.equal(response.status, 200); assert.deepEqual(Object.keys(data).sort(), ["displayed", "title", "date", "startAt", "expiresAt"].sort()); assert.equal(data.title, task.title);
  assert.equal(f.calls[0][1], await sha256(token)); assert.equal(f.calls[0][2], await sha256(`${body.installationId}:${body.deviceToken}`)); assert.equal(response.headers.get("Cache-Control"), "no-store");
  for (const secret of [task.notes, token, body.deviceToken, body.userId]) assert.equal(JSON.stringify(data).includes(secret), false);
});
test("completed/deleted/retimed tasks and foreign/rebound/expired receipts never return a title or acknowledge", async () => {
  for (const mode of ["missing", "owner", "revision", "completed", "retimed", "expired"]) {
    const f = fixture();
    if (mode === "missing") f.deps.store.authorize = async () => null;
    if (mode === "owner") f.result.userId = id(9);
    if (mode === "revision") f.result.revision = 2;
    if (mode === "completed") f.plan.tasks[0].done = true;
    if (mode === "retimed") Object.assign(f.plan.tasks[0], { startTime: "00:01", endTime: "01:01" });
    if (mode === "expired") f.deps.now = () => new Date(f.result.expiresAt);
    const response = await handlePushReceipt(req({ ...body, action: "ack" }), f.deps); assert.equal(response.status, 410); assert.equal((await response.text()).includes(task.title), false); assert.equal(f.calls.some(c => c[3] === "ack"), false);
  }
});
test("displayed receipts suppress repeats and acknowledgement rechecks ownership without returning plan text", async () => {
  const f = fixture(); f.result.displayed = true; assert.deepEqual(await (await handlePushReceipt(req(), f.deps)).json(), { displayed: true });
  const g = fixture(); const response = await handlePushReceipt(req({ ...body, action: "ack" }), g.deps); assert.deepEqual(await response.json(), { ok: true }); assert.deepEqual(g.calls.map(c => c[3]), ["check", "ack"]);
  const h = fixture(); h.deps.store.authorize = async (_body, _receipt, _binding, action) => action === "check" ? h.result : null;
  assert.equal((await handlePushReceipt(req({ ...body, action: "ack" }), h.deps)).status, 410);
});
test("receipt backend failures are private and never cached", async () => {
  const f = fixture(); f.deps.store.authorize = async () => { throw new Error("private plan or secret"); };
  const response = await handlePushReceipt(req(), f.deps); assert.equal(response.status, 503); assert.equal((await response.text()).includes("private plan"), false);
});
