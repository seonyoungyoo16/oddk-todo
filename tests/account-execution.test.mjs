import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { loadPlan } from "../supabase/functions/_shared/plan-migration.ts";
const root = "https://synxmskamifpovuziecx.supabase.co", key = "sb_publishable_ACwZjSLbL_dU9hilmAV7CQ_FEH8AT29";
const users = JSON.parse(readFileSync(new URL("../.sync-auth-fixture.json", import.meta.url), "utf8"));
assert.equal(users.length, 2); assert.ok(users.every(u => u.email.endsWith("@example.invalid") && u.marker.startsWith("oddk-verification-")));
const clients = users.map(() => createClient(root, key, { auth: { persistSession: false, autoRefreshToken: false } }));
const sessions = [];
let checks = 0;
async function api(body, expected = 200, account = 0, extra = {}) {
  const response = await fetch(`${root}/functions/v1/execution`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${sessions[account].access_token}`, ...extra }, body: JSON.stringify(body) });
  const value = await response.json(); assert.equal(response.status, expected, JSON.stringify(value)); assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal("plan" in value, false); return value;
}
const command = (revision, command, operationId = randomUUID()) => ({ action: "command", revision, operationId, command });
try {
  for (let i = 0; i < 2; i++) {
    const { data, error } = await clients[i].auth.signInWithPassword({ email: users[i].email, password: users[i].password }); assert.equal(error, null); sessions.push(data.session);
    const plan = loadPlan(JSON.stringify({ start: "09:00", tasks: ["one", "two"].map(id => ({ id, title: `Synthetic ${id}`, done: false, priority: "normal", minutes: 30, bufferMinutes: 5, startTime: null })) })).plan;
    const response = await fetch(`${root}/functions/v1/plan-sync`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${data.session.access_token}` }, body: JSON.stringify({ action: "ensure", plan }) });
    assert.equal(response.status, 200); await response.json();
  }
  const original = (await clients[0].from("account_plans").select("plan,version,updated_at").single()).data;
  const initial = await api({ action: "status" }); assert.equal(initial.revision, 0); assert.equal(initial.current, null); checks++;
  await api({ action: "status" }, 401, 0, { authorization: "Bearer invalid" }); await api({ action: "status" }, 403, 0, { origin: "https://evil.invalid" }); await api({ action: "status", user: users[1].id }, 400); checks++;
  const requests = [command(0, { type: "start", taskId: "one" }), command(0, { type: "start", taskId: "two" })];
  const timings = [];
  const results = await Promise.all(requests.map(async (body, i) => {
    const sent = performance.now();
    const response = await fetch(`${root}/functions/v1/execution`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${sessions[0].access_token}` }, body: JSON.stringify(body) });
    const value = await response.json(); timings[i] = { sent, received: performance.now() }; return { status: response.status, value };
  }));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  assert.ok(Math.max(...timings.map(t => t.sent)) < Math.min(...timings.map(t => t.received)), "Both real HTTP requests must be in flight together");
  const winner = results.findIndex(r => r.status === 200), started = results[winner].value, active = started.current.id;
  assert.equal(started.revision, 1); checks++;
  const replay = await api(requests[winner]); assert.equal(replay.replayed, true); assert.equal(replay.current.id, active); assert.equal(replay.revision, 1);
  await api({ ...requests[winner], revision: 1 }, 409); checks++;
  assert.equal((await api({ action: "status" }, 200, 1)).current, null);
  await api(command(0, { type: "pause", recordId: active }), 409, 1); checks++;
  let state = await api(command(1, { type: "pause", recordId: active })); assert.equal(state.current.segments.at(-1).end !== null, true);
  const pausedRevision = state.revision;
  state = await api(command(pausedRevision, { type: "pause", recordId: active })); assert.equal(state.revision, pausedRevision);
  state = await api(command(state.revision, { type: "break", recordId: active })); assert.equal(state.current.segments.at(-1).kind, "break");
  state = await api(command(state.revision, { type: "resume", recordId: active })); assert.equal(state.current.segments.at(-1).kind, "work"); checks++;
  const switched = await api(command(state.revision, { type: "switch", taskId: started.current.taskId === "one" ? "two" : "one", fromRecordId: active }));
  assert.notEqual(switched.current.id, active); const second = switched.current.id;
  state = await api(command(switched.revision, { type: "stop", recordId: second })); assert.equal(state.current, null); checks++;
  assert.deepEqual((await clients[0].from("account_plans").select("plan,version,updated_at").single()).data, original); checks++;
  // Closed historical manual record; no automatic estimate or plan mutation.
  const end = new Date(Date.now() - 2 * 86400000).toISOString(), start = new Date(Date.parse(end) - 600000).toISOString();
  const manual = command(state.revision, { type: "manual", taskId: "one", segments: [{ kind: "work", start, end }] });
  state = await api(manual); assert.equal(state.current, null);
  await api(command(state.revision, { type: "manual", taskId: "two", segments: [{ kind: "break", start, end }] }), 409); checks++;
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(start));
  let history = await api({ action: "history", from: date, to: date, limit: 1, cursor: null });
  assert.equal(history.totals.workMs, 600000); assert.equal(history.records[0].id, manual.operationId);
  assert.deepEqual((await api({ action: "history", from: date, to: date, limit: 1, cursor: null }, 200, 1)).records, []);
  const correctedStart = new Date(Date.parse(start) + 60000).toISOString();
  state = await api(command(state.revision, { type: "correct", recordId: manual.operationId, segments: [{ kind: "work", start: correctedStart, end }] }));
  history = await api({ action: "history", from: date, to: date, limit: 1, cursor: null }); assert.equal(history.totals.workMs, 540000); checks++;
  // Completion/deletion close the current timer via the real plan-sync update.
  async function push(plan) {
    const row = (await clients[0].from("account_plans").select("version").single()).data;
    const response = await fetch(`${root}/functions/v1/plan-sync`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${sessions[0].access_token}` }, body: JSON.stringify({ action: "push", version: row.version, plan }) });
    assert.equal(response.status, 200); await response.json();
  }
  state = await api(command(state.revision, { type: "start", taskId: "one" }));
  await push({ ...original.plan, tasks: original.plan.tasks.map(t => t.id === "one" ? { ...t, done: true } : t) });
  state = await api({ action: "status" }); assert.equal(state.current, null);
  await push(original.plan); assert.equal((await api({ action: "status" })).current, null); checks++;
  state = await api(command(state.revision, { type: "start", taskId: "one" }));
  await push({ ...original.plan, tasks: original.plan.tasks.filter(t => t.id !== "one") });
  assert.equal((await api({ action: "status" })).current, null); checks++;
  for (const table of ["execution_records", "execution_states", "execution_operations"]) {
    const { error } = await clients[0].from(table).select("*"); assert.equal(error?.code, "42501");
  }
  const denied = await clients[0].rpc("execution_context", { p_user: users[1].id }); assert.equal(denied.error?.code, "42501"); checks++;
  console.log(`PASS ${checks} real execution API groups; simultaneous in-flight starts: one success, one conflict. No physical OAuth or browser QA claimed.`);
} finally {
  for (const client of clients) await client.auth.signOut();
}
