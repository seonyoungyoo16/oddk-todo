import test from "node:test";
import assert from "node:assert/strict";
import { formatExecutionClock } from "../../app/todo/execution-timer.ts";
import { startExecution, transitionExecution, executionTotals } from "../../supabase/functions/_shared/execution.ts";

test("timer formats elapsed seconds without rounding into the next minute", () => {
  assert.equal(formatExecutionClock(59999), "00:00:59");
  assert.equal(formatExecutionClock(3600000 + 61000), "01:01:01");
  assert.equal(formatExecutionClock(-1), "00:00:00");
  assert.equal(formatExecutionClock(NaN), "00:00:00");
});

test("timer includes work and rest but remains stopped during paused intervals", () => {
  const at = seconds => new Date(Date.parse("2026-10-31T14:59:30Z") + seconds * 1000).toISOString();
  let record = startExecution({ id: "task", title: "작업", plannedDate: "2026-10-31", minutes: 60, bufferMinutes: 10, done: false }, "00000000-0000-4000-8000-000000000123", at(0));
  record = transitionExecution(record, "pause", at(45));
  const before = executionTotals(record, at(45)), paused = executionTotals(record, at(90));
  assert.equal(formatExecutionClock(before.workMs + before.breakMs), "00:00:45");
  assert.deepEqual(paused, before);
  record = transitionExecution(record, "break", at(90));
  const rest = executionTotals(record, at(105));
  assert.equal(rest.workMs, 45000); assert.equal(rest.breakMs, 15000);
  const longerRest = executionTotals(record, at(135));
  assert.equal(longerRest.workMs, rest.workMs);
  assert.equal(longerRest.breakMs, 45000);
  assert.equal(formatExecutionClock(rest.workMs + rest.breakMs), "00:01:00");
  record = transitionExecution(record, "stop", at(105));
  assert.deepEqual(executionTotals(record, at(180)), rest);
});
