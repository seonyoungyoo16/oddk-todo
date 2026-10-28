import test from "node:test";
import assert from "node:assert/strict";
import { loadPlan } from "../../supabase/functions/_shared/plan-migration.ts";
import { parseExecutionRequest, applyExecutionCommand, ExecutionCommandError } from "../../supabase/functions/_shared/execution-command.ts";
import { startExecution, transitionExecution, executionPhase, executionTotals } from "../../supabase/functions/_shared/execution.ts";
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const at = minutes => new Date(Date.parse("2026-10-28T00:00:00.000Z") + minutes * 60000).toISOString();
function plan() { return loadPlan(JSON.stringify({ start: "09:00", tasks: ["one", "two"].map(id => ({ id, title: `Synthetic ${id}`, minutes: 30, bufferMinutes: 5, startTime: null, priority: "normal", done: false })) })).plan; }
const request = (command, revision = 2, operationId = id(5)) => ({ action: "command", operationId, revision, command });
const context = () => ({ plan: plan(), current: null, target: null, revision: 2, now: at(20) });
const code = (expected, run) => assert.throws(run, error => error instanceof ExecutionCommandError && error.code === expected);
test("strict requests exclude owner/time injection and canonicalize reordered command JSON", () => {
  const value = request({ type: "start", taskId: "one" });
  assert.deepEqual(parseExecutionRequest(value), value);
  const reordered = { command: { taskId: "one", type: "start" }, revision: 2, operationId: id(5), action: "command" };
  assert.equal(JSON.stringify(parseExecutionRequest(reordered)), JSON.stringify(parseExecutionRequest(value)));
  for (const bad of [{ ...value, owner: id(2) }, { ...value, now: at(0) }, { ...value, revision: -1 }, { ...value, revision: Number.MAX_SAFE_INTEGER }, { ...value, command: { ...value.command, title: "forged" } }, { ...value, operationId: "invalid" }, { ...value, command: { type: "stop" } }]) assert.equal(parseExecutionRequest(bad), null);
  assert.deepEqual(parseExecutionRequest({ action: "status" }), { action: "status" }); assert.equal(parseExecutionRequest({ action: "status", userId: id(2) }), null);
});
test("history requests bound date ranges, rows and opaque tuple cursors", () => {
  const value = { action: "history", from: "2026-01-01", to: "2026-12-31", limit: 100, cursor: null };
  assert.deepEqual(parseExecutionRequest(value), value);
  assert.ok(parseExecutionRequest({ ...value, cursor: { startedAt: at(0), id: id(1) } }));
  for (const patch of [{ from: "2026-02-30" }, { to: "2027-01-02" }, { from: "2027-01-01" }, { limit: 0 }, { limit: 101 }, { limit: 1.5 }, { cursor: {} }, { cursor: { startedAt: at(0), id: id(1), userId: id(2) } }]) assert.equal(parseExecutionRequest({ ...value, ...patch }), null);
});
test("manual request parsing bounds segments and never accepts an open or noncanonical interval", () => {
  const segments = [{ kind: "work", start: at(0), end: at(5) }], value = request({ type: "manual", taskId: "one", segments });
  const parsed = parseExecutionRequest(value); assert.ok(parsed); segments[0].end = at(6); assert.equal(parsed.command.segments[0].end, at(5));
  for (const bad of [[], Array.from({ length: 65 }, () => ({ kind: "work", start: at(0), end: at(1) })), [{ kind: "work", start: at(0), end: null }], [{ kind: "idle", start: at(0), end: at(1) }], [{ kind: "work", start: at(0), end: at(1), owner: id(2) }]]) assert.equal(parseExecutionRequest(request({ type: "manual", taskId: "one", segments: bad })), null);
});
test("start and confirmed switch compile a complete immutable delta and keep the plan unchanged", () => {
  const ctx = context(), before = JSON.stringify(ctx);
  const started = applyExecutionCommand(request({ type: "start", taskId: "one" }), ctx); assert.equal(started.records.length, 1); assert.equal(started.activeId, id(5)); assert.equal(started.records[0].startedAt, ctx.now); assert.equal(started.records[0].plannedWorkMinutes, 25); assert.equal(JSON.stringify(ctx), before);
  ctx.current = startExecution(ctx.plan.tasks[0], id(1), at(0)); const original = JSON.stringify(ctx);
  code("active", () => applyExecutionCommand(request({ type: "start", taskId: "two" }), ctx));
  code("stale", () => applyExecutionCommand(request({ type: "switch", taskId: "two", fromRecordId: id(9) }), ctx));
  const switched = applyExecutionCommand(request({ type: "switch", taskId: "two", fromRecordId: id(1) }), ctx);
  assert.equal(switched.records.length, 2); assert.equal(switched.records[0].endedAt, at(20)); assert.equal(switched.records[1].taskId, "two"); assert.equal(switched.records[1].startedAt, at(20)); assert.equal(switched.activeId, id(5)); assert.equal(JSON.stringify(ctx), original);
});
test("state versions, reserved IDs and contradictory record reads fail without partial changes", () => {
  const ctx = context(); ctx.current = startExecution(ctx.plan.tasks[0], id(1), at(0)); const before = JSON.stringify(ctx);
  code("stale", () => applyExecutionCommand(request({ type: "pause", recordId: id(1) }, 1), ctx));
  code("stale", () => applyExecutionCommand(request({ type: "manual", taskId: "one", segments: [{ kind: "work", start: at(0), end: at(1) }] }, 2, id(1)), ctx));
  code("unavailable", () => applyExecutionCommand(request({ type: "stop", recordId: id(1) }), { ...ctx, target: transitionExecution(ctx.current, "stop", at(10)) }));
  code("missing", () => applyExecutionCommand(request({ type: "switch", taskId: "deleted", fromRecordId: id(1) }), ctx));
  assert.equal(JSON.stringify(ctx), before);
  const doneContext = { ...ctx, plan: { ...ctx.plan, tasks: ctx.plan.tasks.map(task => task.id === "two" ? { ...task, done: true } : task) } };
  const doneBefore = JSON.stringify(doneContext); code("invalid", () => applyExecutionCommand(request({ type: "switch", taskId: "two", fromRecordId: id(1) }), doneContext)); assert.equal(JSON.stringify(doneContext), doneBefore);
});
test("phase changes address only the active record, replayed closed stop is harmless and expired work frees the active slot", () => {
  const ctx = context(); ctx.current = startExecution(ctx.plan.tasks[0], id(1), at(0));
  const paused = applyExecutionCommand(request({ type: "pause", recordId: id(1) }), ctx); assert.equal(executionPhase(paused.records[0]), "paused"); assert.equal(paused.activeId, id(1));
  const noOp = applyExecutionCommand(request({ type: "pause", recordId: id(1) }), { ...ctx, current: paused.records[0] }); assert.equal(noOp.records.length, 0); assert.equal(noOp.activeId, id(1));
  code("stale", () => applyExecutionCommand(request({ type: "stop", recordId: id(9) }), ctx));
  const ended = transitionExecution(startExecution(ctx.plan.tasks[1], id(2), at(0)), "stop", at(5));
  const oldStop = applyExecutionCommand(request({ type: "stop", recordId: id(2) }), { ...ctx, target: ended }); assert.equal(oldStop.records.length, 0); assert.equal(oldStop.activeId, id(1));
  const expired = applyExecutionCommand(request({ type: "resume", recordId: id(1) }), { ...ctx, now: at(1500) }); assert.equal(expired.activeId, null); assert.equal(expired.records[0].needsReview, true);
});
test("manual/correct deltas preserve an unrelated active timer and reject open, missing, future or overlapping corrections", () => {
  const ctx = context(); ctx.current = startExecution(ctx.plan.tasks[0], id(1), at(0));
  const segments = [{ kind: "work", start: at(1), end: at(4) }];
  const manual = applyExecutionCommand(request({ type: "manual", taskId: "two", segments }), ctx); assert.equal(manual.activeId, id(1)); assert.equal(manual.records[0].finishReason, "manual");
  const target = transitionExecution(startExecution(ctx.plan.tasks[1], id(2), at(0)), "stop", at(5));
  const corrected = applyExecutionCommand(request({ type: "correct", recordId: id(2), segments }), { ...ctx, target }); assert.equal(corrected.activeId, id(1)); assert.equal(corrected.records[0].id, id(2)); assert.equal(executionTotals(corrected.records[0], at(20)).workMs, 3 * 60000);
  code("missing", () => applyExecutionCommand(request({ type: "correct", recordId: id(2), segments }), ctx));
  code("invalid", () => applyExecutionCommand(request({ type: "correct", recordId: id(1), segments }), { ...ctx, target: ctx.current }));
  code("invalid", () => applyExecutionCommand(request({ type: "manual", taskId: "two", segments: [{ kind: "work", start: at(1), end: at(21) }] }), ctx));
  code("invalid", () => applyExecutionCommand(request({ type: "correct", recordId: id(2), segments: [{ kind: "work", start: at(1), end: at(4) }, { kind: "break", start: at(3), end: at(5) }] }), { ...ctx, target }));
  // Cross-record overlap is a store transaction constraint, not proved here.
});
