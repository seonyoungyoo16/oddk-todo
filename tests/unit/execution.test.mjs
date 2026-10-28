import test from "node:test";
import assert from "node:assert/strict";
import { startExecution, transitionExecution, expireExecution, validExecutionRecord, executionPhase, executionTotals, correctExecution, manualExecution, isExecutionTime } from "../../supabase/functions/_shared/execution.ts";

const id = "00000000-0000-4000-8000-000000000001";
const base = Date.parse("2026-10-28T00:00:00.000Z");
const at = minutes => new Date(base + minutes * 60000).toISOString();
const task = () => ({ id: "synthetic-task", title: "Synthetic work", plannedDate: "2026-10-28", minutes: 60, bufferMinutes: 10, done: false });
const create = () => startExecution(task(), id, at(0));
const clone = value => JSON.parse(JSON.stringify(value));
function frozen(value) { Object.freeze(value); if (value.segments) { value.segments.forEach(Object.freeze); Object.freeze(value.segments); } return value; }

test("start snapshots planned work/total/date without changing or later following the plan", () => {
  const plan = task(), before = clone(plan), value = startExecution(plan, id, at(0));
  assert.deepEqual(plan, before); assert.equal(value.plannedTotalMinutes, 60); assert.equal(value.plannedWorkMinutes, 50); assert.equal(executionPhase(value), "work"); assert.equal(validExecutionRecord(value), true);
  plan.title = "Changed later"; plan.minutes = 120; assert.equal(value.title, before.title); assert.equal(value.plannedTotalMinutes, 60);
  assert.equal(startExecution({ ...task(), minutes: null, bufferMinutes: null }, id, at(0)).plannedWorkMinutes, null);
  for (const patch of [{ done: true }, { summaryOnly: true }, { minutes: 1 }, { bufferMinutes: 60 }, { plannedDate: "2026-02-30" }]) assert.throws(() => startExecution({ ...task(), ...patch }, id, at(0)));
});
test("pause excludes gaps, explicit rest stays separate, replayed phases are no-ops and stop preserves plan snapshots", () => {
  let value = frozen(create()); const original = clone(value);
  value = transitionExecution(value, "pause", at(10)); assert.equal(executionPhase(value), "paused"); assert.equal(transitionExecution(value, "pause", at(11)), value);
  value = transitionExecution(frozen(value), "resume", at(20)); assert.equal(transitionExecution(value, "resume", at(21)), value);
  value = transitionExecution(frozen(value), "break", at(30)); assert.equal(executionPhase(value), "break"); assert.equal(transitionExecution(value, "break", at(31)), value);
  value = transitionExecution(frozen(value), "resume", at(35)); value = transitionExecution(frozen(value), "stop", at(40));
  assert.equal(executionPhase(value), "stopped"); assert.deepEqual(executionTotals(value, at(40)), { workMs: 25 * 60000, breakMs: 5 * 60000, clockIssue: false });
  assert.equal(value.plannedTotalMinutes, 60); assert.equal(value.plannedWorkMinutes, 50); assert.deepEqual(original, create()); assert.equal(transitionExecution(value, "stop", at(45)), value); assert.throws(() => transitionExecution(value, "resume", at(45)));
});
test("backward commands and invalid operations preserve the entire record", () => {
  const value = transitionExecution(create(), "pause", at(10)), before = clone(value);
  for (const action of ["pause", "resume", "break", "stop"]) assert.throws(() => transitionExecution(value, action, at(9)), /기기 시각/);
  assert.throws(() => transitionExecution(value, "invalid", at(20))); assert.throws(() => transitionExecution(value, "stop", "2026-10-28"));
  assert.deepEqual(value, before); assert.equal(executionPhase(value), "paused");
});
test("24-hour abandoned work closes at the exact limit for review, while paused time is never invented", () => {
  const running = create(), ended = expireExecution(frozen(running), at(1441));
  assert.equal(ended.endedAt, at(1440)); assert.equal(ended.needsReview, true); assert.equal(ended.finishReason, "limit"); assert.equal(validExecutionRecord(ended), true);
  assert.equal(executionTotals(ended, at(2000)).workMs, 1440 * 60000); assert.equal(executionTotals(running, at(2000)).workMs, 1440 * 60000);
  const paused = transitionExecution(create(), "pause", at(10)); assert.equal(expireExecution(paused, at(1439)), paused);
  const expiredPause = transitionExecution(paused, "resume", at(1500)); assert.equal(expiredPause.finishReason, "limit"); assert.equal(executionTotals(expiredPause, at(1500)).workMs, 10 * 60000);
});
test("strict records reject overlaps, multiple open segments, false review flags and malformed timestamps", () => {
  const value = transitionExecution(create(), "stop", at(10));
  const bad = [
    { ...value, owner: "forged" }, { ...value, schemaVersion: 2 }, { ...value, id: "wrong" }, { ...value, plannedWorkMinutes: 60 },
    { ...value, needsReview: true }, { ...value, finishReason: "limit" }, { ...value, finishReason: "limit", needsReview: true }, { ...value, endedAt: at(-1) },
    { ...value, segments: [{ kind: "work", start: at(0), end: at(7) }, { kind: "break", start: at(6), end: at(10) }] },
    { ...create(), segments: [{ kind: "work", start: at(0), end: null }, { kind: "work", start: at(1), end: null }] },
    { ...value, segments: [{ kind: "work", start: at(1), end: at(10) }] },
  ];
  for (const candidate of bad) assert.equal(validExecutionRecord(candidate), false);
  for (const time of ["2026-02-30T00:00:00.000Z", "0000-01-01T00:00:00.000Z", "2026-10-28T09:00:00.000+09:00", "2026-10-28T00:00:00Z", "2026-10-28T00:00:60.000Z"]) assert.equal(isExecutionTime(time), false);
});
test("manual correction retains identity and planned snapshots, allows completed-task history and rejects future/open or overlapping intervals", () => {
  const old = transitionExecution(create(), "stop", at(20)), before = clone(old);
  const segments = [{ kind: "work", start: at(2), end: at(8) }, { kind: "break", start: at(10), end: at(12) }];
  const corrected = correctExecution(frozen(old), segments, at(30)); assert.equal(corrected.id, old.id); assert.equal(corrected.title, old.title); assert.equal(corrected.plannedWorkMinutes, 50); assert.equal(corrected.startedAt, at(2)); assert.equal(corrected.finishReason, "manual");
  assert.deepEqual(executionTotals(corrected, at(30)), { workMs: 6 * 60000, breakMs: 2 * 60000, clockIssue: false }); assert.deepEqual(old, before);
  segments[0].end = at(9); assert.equal(corrected.segments[0].end, at(8));
  assert.equal(validExecutionRecord(manualExecution({ ...task(), done: true }, id, segments, at(30))), true);
  assert.throws(() => correctExecution(create(), segments, at(30)), /먼저 종료/);
  for (const bad of [[], [{ kind: "work", start: at(0), end: null }], [{ kind: "work", start: at(0), end: at(31) }], [{ kind: "work", start: at(10), end: at(9) }]]) assert.throws(() => correctExecution(old, bad, at(30)));
});
test("Korean midnight splits actual intervals on actual dates without changing the planned date", () => {
  const begin = "2026-10-28T14:50:00.000Z", finish = "2026-10-28T15:10:00.000Z";
  const value = transitionExecution(startExecution(task(), id, begin), "stop", finish);
  assert.equal(executionTotals(value, finish, "2026-10-28").workMs, 10 * 60000); assert.equal(executionTotals(value, finish, "2026-10-29").workMs, 10 * 60000);
  assert.equal(executionTotals(value, finish, "2026-10-30").workMs, 0); assert.equal(value.plannedDate, "2026-10-28"); assert.throws(() => executionTotals(value, finish, "2026-02-30"));
});
test("elapsed milliseconds stay exact and a backwards display clock reports a problem without negative work", () => {
  const begin = "2026-10-28T00:00:00.123Z", finish = "2026-10-28T00:00:02.456Z", value = startExecution(task(), id, begin);
  assert.deepEqual(executionTotals(value, at(-1)), { workMs: 0, breakMs: 0, clockIssue: true });
  assert.equal(executionTotals(value, finish).workMs, 2333); assert.equal(executionTotals(transitionExecution(value, "stop", finish), at(-1)).workMs, 2333);
  for (const reason of ["completed", "removed"]) assert.equal(transitionExecution(value, "stop", finish, reason).finishReason, reason);
});
test("segment limits block another resume while always allowing pause/stop; boundary years stay canonical", () => {
  let value = create(); for (let i = 1; i <= 63; i++) value = transitionExecution(value, i % 2 ? "break" : "resume", at(i));
  assert.equal(value.segments.length, 64); value = transitionExecution(value, "pause", at(64)); const before = clone(value);
  assert.throws(() => transitionExecution(value, "resume", at(65)), /64/); assert.deepEqual(value, before); assert.equal(validExecutionRecord(transitionExecution(value, "stop", at(66))), true);
  const first = startExecution(task(), id, "0001-01-01T00:00:00.000Z"); assert.equal(validExecutionRecord(first), true);
  const last = startExecution(task(), id, "9999-12-31T23:59:59.000Z"); assert.equal(validExecutionRecord(expireExecution(last, "9999-12-31T23:59:59.999Z")), true);
});
