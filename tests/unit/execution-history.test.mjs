import test from "node:test";
import assert from "node:assert/strict";
import { startExecution, transitionExecution } from "../../supabase/functions/_shared/execution.ts";
import { latestFinishedExecution, finishedExecutionSummary } from "../../app/todo/execution-history.ts";

const at = seconds => new Date(Date.parse("2026-10-31T00:00:00Z") + seconds * 1000).toISOString();
const task = { id: "a", title: "저장된 작업", plannedDate: "2026-10-31", minutes: 60, bufferMinutes: 10, done: false };
const start = (id, seconds = 0) => startExecution(task, `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`, at(seconds));

test("latest completed record excludes running records and preserves persisted snapshots", () => {
  const older = transitionExecution(start(1), "stop", at(30));
  const later = transitionExecution(start(2, 60), "stop", at(120));
  const running = start(3, 180), records = [older, running, later], before = JSON.stringify(records);
  assert.equal(latestFinishedExecution(records, "a").id, later.id);
  assert.equal(latestFinishedExecution(records, "deleted-task"), null);
  assert.equal(finishedExecutionSummary(running), null);
  assert.equal(JSON.stringify(records), before);
  const reloaded = JSON.parse(before);
  assert.equal(latestFinishedExecution(reloaded, "a").title, "저장된 작업");
  assert.equal(finishedExecutionSummary(reloaded[2]).workMs, 60000);
});

test("finished record displays committed work/rest without adding paused or later wall-clock time", () => {
  let record = transitionExecution(start(4), "pause", at(20));
  record = transitionExecution(record, "break", at(40));
  record = transitionExecution(record, "stop", at(55));
  assert.deepEqual(finishedExecutionSummary(record, "2026-10-31"), { workMs: 20000, breakMs: 15000, clockIssue: false });
  assert.deepEqual(finishedExecutionSummary(record, "2026-11-01"), { workMs: 0, breakMs: 0, clockIssue: false });
});
