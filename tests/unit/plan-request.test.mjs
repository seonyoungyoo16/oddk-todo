import test from "node:test";
import assert from "node:assert/strict";
import { parsePlanRequest } from "../../supabase/functions/plan-sync/request.ts";
const plan = { tasks: [], start: "09:00" };

test("invalid JSON, request shapes and actions return 400", () => {
  for (const text of ["{", "null", "[]", "1", '"text"', "{}", '{"action":"unknown"}', JSON.stringify({ action: "ensure", plan: {} })]) {
    assert.equal(parsePlanRequest(text).status, 400);
  }
});
test("UTF8 payload limit is 413 rather than an incidental parse failure", () => {
  assert.equal(parsePlanRequest(" ".repeat(1000000)).status, 400);
  assert.equal(parsePlanRequest(" ".repeat(1000001)).status, 413);
  assert.equal(parsePlanRequest("가".repeat(333334)).status, 413);
});
test("only ensure and push carry validated plans; supplied ownership is discarded", () => {
  assert.deepEqual(parsePlanRequest(JSON.stringify({ action: "pull", user_id: "untrusted" })), { ok: true, body: { action: "pull" } });
  assert.equal(parsePlanRequest(JSON.stringify({ action: "ensure", plan })).ok, true);
  for (const version of [null, 0, -1, 1.5, "1", Number.MAX_SAFE_INTEGER]) assert.equal(parsePlanRequest(JSON.stringify({ action: "push", plan, version })).status, 400);
  assert.equal(parsePlanRequest(JSON.stringify({ action: "push", plan, version: 1 })).ok, true);
  const invalidPlan = { ...plan, tasks: [{ id: "synthetic", title: "Test", minutes: 25, bufferMinutes: 30, startTime: null, priority: "normal", done: false }] };
  for (const action of ["push", "ensure"]) assert.equal(parsePlanRequest(JSON.stringify({ action, plan: invalidPlan, version: 1 })).status, 400);
});
