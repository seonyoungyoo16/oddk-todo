import test from "node:test";
import assert from "node:assert/strict";
import { applyLocalExecution, emptyExecutionData, executionOverlaps, importLocalExecutions, localExecutionHistory, parseExecutionBackup, reconcileLocalExecution, validLocalExecutionData } from "../../app/todo/execution-local-model.ts";
import { loadPlan } from "../../supabase/functions/_shared/plan-migration.ts";
import { manualExecution, startExecution, transitionExecution } from "../../supabase/functions/_shared/execution.ts";
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const at = minute => new Date(Date.parse("2026-10-28T14:55:00.000Z") + minute * 60000).toISOString();
const plan = loadPlan(JSON.stringify({ start: "09:00", tasks: ["one", "two"].map(id => ({ id, title: `Synthetic ${id}`, done: false, priority: "normal", minutes: 30, bufferMinutes: 5, startTime: null })) })).plan;
const req = (revision, command, n) => ({ action: "command", operationId: id(n), revision, command });
test("local mutations are immutable, duplicate operations replay and competing revisions cannot start another timer", () => {
  const empty = emptyExecutionData(), request = req(0, { type: "start", taskId: "one" }, 1), before = JSON.stringify(empty);
  const started = applyLocalExecution(empty, plan, request, at(0)); assert.equal(JSON.stringify(empty), before); assert.equal(started.revision, 1);
  assert.equal(applyLocalExecution(started, plan, request, at(1)), started);
  assert.throws(() => applyLocalExecution(started, plan, { ...request, revision: 1 }, at(1)), /이미 사용/);
  assert.throws(() => applyLocalExecution(started, plan, req(0, { type: "start", taskId: "two" }, 2), at(1)), /다른 기기/);
  assert.equal(started.records.length, 1);
});
test("closed history and explicit rest survive task completion/deletion while undo never restarts", () => {
  let data = applyLocalExecution(emptyExecutionData(), plan, req(0, { type: "start", taskId: "one" }, 1), at(0));
  data = applyLocalExecution(data, plan, req(1, { type: "break", recordId: id(1) }, 2), at(2));
  const complete = { ...plan, tasks: plan.tasks.map(t => ({ ...t, done: true })) };
  const closed = reconcileLocalExecution(data, complete, at(3)); assert.equal(closed.records[0].finishReason, "completed");
  assert.equal(reconcileLocalExecution(closed, plan, at(4)), closed); assert.equal(closed.records[0].plannedWorkMinutes, 25);
  const deleted = reconcileLocalExecution(data, { ...plan, tasks: [] }, at(3)); assert.equal(deleted.records[0].finishReason, "removed");
  const totals = localExecutionHistory(deleted, "2026-10-28", "2026-10-29", at(4)).totals; assert.deepEqual(totals, { workMs: 120000, breakMs: 60000 });
});
test("manual history cannot overlap closed work or an open interval, but paused gaps and touching boundaries are allowed", () => {
  const open = startExecution(plan.tasks[0], id(1), at(0)), closed = transitionExecution(open, "stop", at(5));
  const record = (key, start, end) => manualExecution(plan.tasks[0], id(key), [{ kind: "work", start: at(start), end: at(end) }], at(20));
  assert.equal(executionOverlaps(closed, record(2, 5, 10)), false); assert.equal(executionOverlaps(closed, record(2, 4, 10)), true);
  assert.equal(executionOverlaps(open, record(2, 10, 15)), true);
  const paused = transitionExecution(open, "pause", at(5)); assert.equal(executionOverlaps(paused, record(2, 10, 15)), false);
  const data = { revision: 0, records: [closed], operations: [] }, before = JSON.stringify(data);
  assert.throws(() => applyLocalExecution(data, plan, req(0, { type: "manual", taskId: "one", segments: record(2, 4, 10).segments }, 2), at(20)), /겹쳐/); assert.equal(JSON.stringify(data), before);
});
test("Korean midnight totals split actual work/rest across days without duplicating the planned snapshot", () => {
  const work = startExecution(plan.tasks[0], id(1), at(0)), rest = transitionExecution(work, "break", at(10)), closed = transitionExecution(rest, "stop", at(15));
  const data = { revision: 1, records: [closed], operations: [] };
  assert.deepEqual(localExecutionHistory(data, "2026-10-28", "2026-10-28", at(20)).totals, { workMs: 300000, breakMs: 0 });
  assert.deepEqual(localExecutionHistory(data, "2026-10-29", "2026-10-29", at(20)).totals, { workMs: 300000, breakMs: 300000 });
  assert.deepEqual(localExecutionHistory(data, "2026-10-28", "2026-10-29", at(20)).totals, { workMs: 600000, breakMs: 300000 });
});
test("abandoned records cap at 24 hours and backward clocks/corrupt storage do not fabricate elapsed time", () => {
  const data = applyLocalExecution(emptyExecutionData(), plan, req(0, { type: "start", taskId: "one" }, 1), at(0));
  const capped = reconcileLocalExecution(data, plan, at(1500)); assert.equal(capped.records[0].endedAt, at(1440)); assert.equal(capped.records[0].needsReview, true);
  assert.deepEqual(localExecutionHistory(data, "2026-10-28", "2026-10-29", at(-1)).totals, { workMs: 0, breakMs: 0 });
  for (const bad of [null, { ...data, revision: -1 }, { ...data, records: [data.records[0], data.records[0]] }, { ...data, records: [{}] }]) assert.equal(validLocalExecutionData(bad), false);
});
test("separate execution backups validate and restore closed records without overwriting conflicting IDs or intervals", () => {
  const one = transitionExecution(startExecution(plan.tasks[0], id(1), at(0)), "stop", at(5));
  const backup = { type: "oddk-executions", schemaVersion: 1, exportedAt: at(10), records: [one] };
  assert.deepEqual(parseExecutionBackup(JSON.stringify(backup)), backup);
  for (const bad of [{ ...backup, schemaVersion: 2 }, { ...backup, records: [one, one] }, { ...backup, plan }, { ...backup, records: [{}] }]) assert.throws(() => parseExecutionBackup(JSON.stringify(bad)));
  const imported = importLocalExecutions(emptyExecutionData(), [one], at(10)); assert.equal(importLocalExecutions(imported, [one], at(10)), imported);
  assert.throws(() => importLocalExecutions(imported, [{ ...one, title: "Changed" }], at(10)), /내용/);
  assert.throws(() => importLocalExecutions(imported, [{ ...one, id: id(2) }], at(10)), /겹쳐/);
  assert.throws(() => importLocalExecutions(imported, [startExecution(plan.tasks[0], id(2), at(6))], at(10)), /종료/);
  assert.throws(() => importLocalExecutions(emptyExecutionData(), [one], at(2)), /과거/);
});
