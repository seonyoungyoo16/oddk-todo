import test from "node:test";
import assert from "node:assert/strict";
import { formatExecutionClock, executionTimerProgress, claimExecutionTimerAlert } from "../../app/todo/execution-timer.ts";
import { startExecution, transitionExecution, executionTotals } from "../../supabase/functions/_shared/execution.ts";

test("timer formats elapsed seconds without rounding into the next minute", () => {
  assert.equal(formatExecutionClock(59999), "00:00:59");
  assert.equal(formatExecutionClock(3600000 + 61000), "01:01:01");
  assert.equal(formatExecutionClock(-1), "00:00:00");
  assert.equal(formatExecutionClock(NaN), "00:00:00");
});

const timerTask = { id: "task", title: "작업", plannedDate: "2026-11-03", minutes: 30, bufferMinutes: 5, done: false };
const timerAt = minutes => new Date(Date.parse("2026-11-03T00:00:00Z") + minutes * 60000).toISOString();
const timerRecord = () => startExecution(timerTask, "00000000-0000-4000-8000-000000000124", timerAt(0));

test("editing the running work target recalculates remaining time without rewriting elapsed, phase or history", () => {
  const record = timerRecord(), original = JSON.stringify(record), seen = new Set();
  assert.equal(executionTimerProgress(record, timerTask, timerAt(10)).remainingMs, 15 * 60000);
  const shorter = { ...timerTask, minutes: 10 };
  const progress = executionTimerProgress(record, shorter, timerAt(10));
  assert.equal(progress.workMs, 10 * 60000); assert.equal(progress.phase, "work");
  assert.equal(progress.remainingMs, 0); assert.equal(progress.overdueMs, 5 * 60000);
  assert.match(claimExecutionTimerAlert(progress, seen), /작업/);
  assert.equal(claimExecutionTimerAlert(executionTimerProgress(record, shorter, timerAt(11)), seen), null);
  const longer = { ...timerTask, minutes: 40 };
  assert.equal(executionTimerProgress(record, longer, timerAt(10)).remainingMs, 25 * 60000);
  assert.equal(claimExecutionTimerAlert(executionTimerProgress(record, longer, timerAt(35)), seen)?.includes("지났어요"), true);
  assert.equal(JSON.stringify(record), original); assert.equal(record.plannedWorkMinutes, 25);
});

test("paused edits stay paused; resuming excludes paused time and shares the same one-shot threshold", () => {
  let record = transitionExecution(timerRecord(), "pause", timerAt(10));
  const original = JSON.stringify(record), changed = { ...timerTask, minutes: 12 };
  const paused = executionTimerProgress(record, changed, timerAt(20));
  assert.equal(paused.phase, "paused"); assert.equal(paused.workMs, 10 * 60000);
  assert.equal(paused.deadlineAt, null); assert.equal(paused.overdue, true);
  const seen = new Set(); assert(claimExecutionTimerAlert(paused, seen));
  assert.equal(JSON.stringify(record), original);
  record = transitionExecution(record, "resume", timerAt(20));
  const resumed = executionTimerProgress(record, changed, timerAt(21));
  assert.equal(resumed.workMs, 11 * 60000); assert.equal(resumed.phase, "work");
  assert.equal(claimExecutionTimerAlert(resumed, seen), null);
  assert.equal(executionTimerProgress(record, timerTask, timerAt(21)).deadlineAt, timerAt(35));
});

test("rest never inherits ALPEN buffer; an explicit future rest limit is a projection only", () => {
  const record = transitionExecution(timerRecord(), "break", timerAt(10));
  const original = JSON.stringify(record), rest = executionTimerProgress(record, timerTask, timerAt(30));
  assert.equal(rest.breakMs, 20 * 60000); assert.equal(rest.limitMs, null);
  assert.equal(rest.alertKey, null); assert.equal(rest.deadlineAt, null); assert.equal(rest.overdue, false);
  const explicit = executionTimerProgress(record, timerTask, timerAt(11), 2);
  assert.equal(explicit.remainingMs, 60000); assert.equal(explicit.deadlineAt, timerAt(12));
  assert.equal(JSON.stringify(record), original);
});

test("unset, ended, completed and removed targets cancel deadlines without using stale start snapshots", () => {
  const record = timerRecord();
  assert.equal(executionTimerProgress(record, { ...timerTask, minutes: null, bufferMinutes: null }, timerAt(30)).alertKey, null);
  assert.equal(executionTimerProgress(record, { ...timerTask, done: true }, timerAt(30)), null);
  assert.equal(executionTimerProgress(record, null, timerAt(30)), null);
  assert.equal(executionTimerProgress(transitionExecution(record, "stop", timerAt(2)), timerTask, timerAt(30)), null);
  assert.equal(executionTimerProgress(record, timerTask, timerAt(-1)).deadlineAt, null);
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
