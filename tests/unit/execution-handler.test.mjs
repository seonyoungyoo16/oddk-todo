import test from "node:test";
import assert from "node:assert/strict";
import { handleExecution } from "../../supabase/functions/execution/handler.ts";
import { loadPlan } from "../../supabase/functions/_shared/plan-migration.ts";
import { startExecution, transitionExecution } from "../../supabase/functions/_shared/execution.ts";
import { sha256 } from "../../supabase/functions/_shared/push-subscription.ts";
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const now = "2026-10-29T00:00:00.000Z";
const plan = loadPlan(JSON.stringify({ start: "09:00", tasks: [{ id: "one", title: "Synthetic one", minutes: 30, bufferMinutes: 5, done: false, priority: "normal", startTime: null }] })).plan;
const request = (body, extra = {}) => new Request("https://example.invalid", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer fixture", origin: "https://seonyoungyoo16.github.io", ...extra }, body: JSON.stringify(body) });
function fixture() {
  const context = { plan, planVersion: 7, current: null, target: null, revision: 0, now, operation: null }, calls = [];
  const deps = { authenticate: async token => token === "fixture" ? id(1) : null, store: {
    async context(...args) { calls.push(["context", ...args]); return context; },
    async commit(user, req, hash, ctx, change) { calls.push(["commit", user, req, hash, ctx, change]); return { revision: 1, current: change.records.at(-1), now }; },
    async history(...args) { calls.push(["history", ...args]); return { records: [], totals: { workMs: 0, breakMs: 0 }, now }; },
  } };
  return { context, calls, deps };
}
test("execution HTTP gates reject foreign origins, methods, auth and oversized/malformed input before storage", async () => {
  const f = fixture();
  for (const [req, expected] of [[request({ action: "status" }, { origin: "https://evil.invalid" }), 403], [new Request("https://example.invalid"), 405], [request({}, { "content-type": "text/plain" }), 415], [request({}, { authorization: "Bearer wrong" }), 401], [request({ action: "status", user: id(2) }), 400], [request({ huge: "a".repeat(32769) }), 413]]) {
    const r = await handleExecution(req, f.deps); assert.equal(r.status, expected); assert.equal(r.headers.get("cache-control"), "no-store");
  }
  assert.deepEqual(f.calls, []);
});
test("start snapshots server-owned plan/time and commits only the authenticated user's complete delta", async () => {
  const f = fixture(), body = { action: "command", operationId: id(4), revision: 0, command: { type: "start", taskId: "one" } };
  const response = await handleExecution(request(body), f.deps), value = await response.json();
  assert.equal(response.status, 200); assert.equal(value.current.title, "Synthetic one"); assert.equal(value.current.startedAt, now);
  assert.deepEqual(f.calls[0], ["context", id(1), id(4), id(4)]);
  const commit = f.calls[1]; assert.equal(commit[1], id(1)); assert.equal(commit[3], await sha256(JSON.stringify(body))); assert.equal(commit[5].activeId, id(4));
  assert.equal("plan" in value, false); assert.equal("target" in value, false); assert.equal("planVersion" in value, false);
});
test("lost-response replay returns current state before stale-version compilation and rejects changed payload", async () => {
  const f = fixture(), body = { action: "command", operationId: id(4), revision: 0, command: { type: "start", taskId: "one" } };
  f.context.revision = 20; f.context.current = startExecution(plan.tasks[0], id(8), now); f.context.operation = { hash: await sha256(JSON.stringify(body)), version: 1 };
  let response = await handleExecution(request(body), f.deps); assert.equal(response.status, 200); assert.equal((await response.json()).replayed, true); assert.equal(f.calls.length, 1);
  response = await handleExecution(request({ ...body, revision: 20 }), f.deps); assert.equal(response.status, 409); assert.equal((await response.json()).code, "operation"); assert.equal(f.calls.length, 2);
});
test("history pages have a cursor while totals retain the complete period and owner comes from auth", async () => {
  const f = fixture(), records = [id(6), id(5)].map(key => transitionExecution(startExecution(plan.tasks[0], key, now), "stop", "2026-10-29T00:10:00.000Z"));
  f.deps.store.history = async (user, req) => { assert.equal(user, id(1)); assert.equal(req.limit, 1); return { records, totals: { workMs: 1200000, breakMs: 0 }, now }; };
  const response = await handleExecution(request({ action: "history", from: "2026-10-29", to: "2026-10-29", limit: 1, cursor: null }), f.deps), value = await response.json();
  assert.equal(response.status, 200); assert.equal(value.records.length, 1); assert.equal(value.totals.workMs, 1200000); assert.deepEqual(value.cursor, { startedAt: now, id: id(6) });
});
test("database CAS/overlap/unavailable errors never report a successful write or expose SQL details", async () => {
  for (const [code, status, exposed] of [["PT409", 409, "stale"], ["40001", 409, "stale"], ["23P01", 409, "overlap"], ["22023", 409, "invalid"], ["P0002", 409, "missing"], ["unhandled", 503, "unavailable"]]) {
    const f = fixture(); f.deps.store.commit = async () => { throw { code, message: "private database information" }; };
    const response = await handleExecution(request({ action: "command", operationId: id(4), revision: 0, command: { type: "start", taskId: "one" } }), f.deps), text = await response.text();
    assert.equal(response.status, status); assert.equal(JSON.parse(text).code, exposed); assert.equal(text.includes("private"), false);
  }
});
test("corrupt server responses fail closed and status never returns the account plan", async () => {
  const f = fixture();
  let response = await handleExecution(request({ action: "status" }), f.deps); assert.deepEqual(await response.json(), { revision: 0, current: null, now });
  f.context.current = {}; response = await handleExecution(request({ action: "status" }), f.deps); assert.equal(response.status, 503);
  f.deps.store.history = async () => ({ records: [], totals: { workMs: -1, breakMs: 0 }, now });
  response = await handleExecution(request({ action: "history", from: "2026-10-29", to: "2026-10-29", limit: 1, cursor: null }), f.deps); assert.equal(response.status, 503);
});
