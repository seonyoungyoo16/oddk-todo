import test from "node:test";
import assert from "node:assert/strict";
import { parsePlanRequest } from "../../supabase/functions/plan-sync/request.ts";
import { validateReplanRequest, ReplanRequestError } from "../../supabase/functions/plan-sync/replan.ts";
import { loadPlan } from "../../supabase/functions/_shared/plan-migration.ts";
import { previewReplan } from "../../supabase/functions/_shared/replan.ts";
const date = "2026-10-29", options = { date, baseMinute: 600, pinnedIds: [] };
const plan = loadPlan(JSON.stringify({ schemaVersion: 2, reviewsByDate: {}, start: "09:00", tasks: [{ id: "one", title: "Synthetic one", done: false, priority: "normal", minutes: 30, bufferMinutes: 5, startTime: null, plannedDate: date }] })).plan;
plan.availabilityByDate = { [date]: { start: "09:00", end: "18:00", fixed: [] } };
const request = () => ({ action: "replan", plan: previewReplan(plan, options).after, version: 3, executionRevision: 2, options });
const context = () => ({ plan, planVersion: 3, revision: 2, current: null, now: "2026-10-29T00:30:00.000Z" });
const rejects = (status, run) => assert.throws(run, error => error instanceof ReplanRequestError && error.status === status);
test("replan request strictly validates both versions, options and modern proposed plan without changing legacy push behavior", () => {
  assert.deepEqual(parsePlanRequest(JSON.stringify(request())), { ok: true, body: request() });
  for (const patch of [{ executionRevision: -1 }, { executionRevision: Number.MAX_SAFE_INTEGER }, { version: 0 }, { options: { ...options, user: "injected" } }, { user: "injected" }, { plan: { start: "09:00", tasks: [] } }]) assert.equal(parsePlanRequest(JSON.stringify({ ...request(), ...patch })).status, 400);
  assert.equal(parsePlanRequest(JSON.stringify({ action: "push", plan: { start: "09:00", tasks: [] }, version: 1 })).ok, true);
});
test("approved schedules are recomputed from the latest server plan and are bound to plan and actual-record versions", () => {
  const body = request(), ctx = context(), before = JSON.stringify(ctx), result = validateReplanRequest(body, ctx);
  assert.deepEqual(result.plan, body.plan); assert.equal(result.firstStart, "2026-10-29T01:00:00.000Z"); assert.equal(JSON.stringify(ctx), before);
  rejects(409, () => validateReplanRequest(body, { ...ctx, planVersion: 4 })); rejects(409, () => validateReplanRequest(body, { ...ctx, revision: 3 }));
  rejects(409, () => validateReplanRequest(body, { ...ctx, current: { id: "some active or paused record" } }));
  const modified = structuredClone(body); modified.plan.tasks[0].title = "Forged title"; rejects(409, () => validateReplanRequest(modified, ctx));
  const shortened = structuredClone(body); shortened.plan.tasks[0].minutes = 20; rejects(409, () => validateReplanRequest(shortened, ctx));
});
test("expired/day-changed/no-op previews and invalid pins never produce a commit delta", () => {
  const body = request(), ctx = context();
  rejects(409, () => validateReplanRequest(body, { ...ctx, now: "2026-10-29T01:00:00.001Z" }));
  rejects(409, () => validateReplanRequest(body, { ...ctx, now: "2026-10-30T00:00:00.000Z" }));
  rejects(400, () => validateReplanRequest({ ...body, options: { ...options, pinnedIds: ["missing"] } }, ctx));
  const scheduled = body.plan; rejects(409, () => validateReplanRequest({ ...body, options: { ...options, pinnedIds: ["one"] } }, { ...ctx, plan: scheduled }));
});
