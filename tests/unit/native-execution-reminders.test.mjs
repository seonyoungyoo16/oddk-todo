import test from "node:test";
import assert from "node:assert/strict";
import { startExecution, transitionExecution } from "../../supabase/functions/_shared/execution.ts";
import { nativeExecutionBoundary, createNativeExecutionReminderController, EXECUTION_REMINDER_OWNER } from "../../app/todo/native-execution-reminders.ts";
import { withNativeNotificationLock } from "../../app/todo/native-notification-lock.ts";
import { restAlertSegment } from "../../app/todo/rest-alert.ts";

const T = Date.parse("2026-11-03T00:00:00Z");
const task = { id: "task", title: "집중", plannedDate: "2026-11-03", minutes: 3, bufferMinutes: 1, done: false };
const record = startExecution(task, "00000000-0000-4000-8000-000000000123", new Date(T).toISOString());
const source = (patch = {}) => ({ scope: "local", record, task, clockOffsetMs: 0, blocked: false, breakLimitMinutes: null, ...patch });
function harness() {
  const h = { now: T, pending: [], delivered: [], ledger: null, schedules: 0, cancellations: [] };
  const port = {
    getPending: async () => ({ notifications: structuredClone(h.pending) }),
    getDelivered: async () => ({ notifications: structuredClone(h.delivered) }),
    cancel: async ids => { h.cancellations.push(...ids); h.pending = h.pending.filter(x => !ids.includes(x.id)); },
    removeDelivered: async ids => { h.delivered = h.delivered.filter(x => !ids.includes(x.id)); },
    schedule: async value => { h.schedules++; if (h.entered) { h.entered(); await h.gate; } h.pending.push(structuredClone(value)); },
    readLedger: async () => structuredClone(h.ledger),
    writeLedger: async value => { h.ledger = structuredClone(value); },
  };
  h.controller = createNativeExecutionReminderController(port, () => h.now);
  return h;
}
test("native deadline follows the shared current task limit, server offset, and immutable historical snapshot", () => {
  const before = structuredClone(record);
  const a = nativeExecutionBoundary(source(), T + 30_000);
  assert.equal(a.deadline, T + 120_000);
  const b = nativeExecutionBoundary(source({ task: { ...task, minutes: 4 } }), T + 30_000);
  assert.equal(b.deadline, T + 180_000); assert.notEqual(a.key, b.key); assert.deepEqual(record, before);
  assert.equal(nativeExecutionBoundary(source({ clockOffsetMs: 10_000 }), T + 30_000).deadline, T + 110_000);
});
test("pause/end/blocked/missing task cancel eligibility, and buffer never implies a rest alarm", () => {
  const paused = transitionExecution(record, "pause", new Date(T + 30_000).toISOString());
  const resting = transitionExecution(record, "break", new Date(T + 30_000).toISOString());
  for (const patch of [{ record: paused }, { record: null }, { blocked: true }, { task: { ...task, done: true } }, { record: resting }]) assert.equal(nativeExecutionBoundary(source(patch), T + 40_000), null);
  assert.equal(nativeExecutionBoundary(source({ record: resting, breakLimitMinutes: 1, breakSegmentKey: restAlertSegment(resting).key }), T + 40_000).phase, "break");
  assert.equal(nativeExecutionBoundary(source({ record: resting, breakLimitMinutes: 1, breakSegmentKey: "stale" }), T + 40_000), null);
});
test("pause/resume and limit edits cancel/rebook only owned execution requests", async () => {
  const h = harness(); h.pending.push({ id: 7, extra: { owner: "foreign" } });
  await h.controller.reconcile(nativeExecutionBoundary(source(), h.now)); assert.equal(h.schedules, 1);
  await h.controller.reconcile(nativeExecutionBoundary(source(), h.now)); assert.equal(h.schedules, 1);
  await h.controller.reconcile(null); assert.equal(h.pending.length, 1);
  const resumed = transitionExecution(transitionExecution(record, "pause", new Date(T + 30_000).toISOString()), "resume", new Date(T + 60_000).toISOString());
  h.now = T + 60_000; await h.controller.reconcile(nativeExecutionBoundary(source({ record: resumed }), h.now));
  assert.equal(h.pending.find(x => x.extra.owner === EXECUTION_REMINDER_OWNER).schedule.at.getTime(), T + 150_000);
  await h.controller.reconcile(nativeExecutionBoundary(source({ record: resumed, task: { ...task, minutes: 2 } }), h.now));
  assert.equal(h.pending.filter(x => x.extra.owner === EXECUTION_REMINDER_OWNER).length, 1); assert.ok(h.pending.some(x => x.id === 7));
});
test("already-overdue boundary is requested once across polling and reconstructed controllers", async () => {
  const h = harness(); h.now = T + 180_000;
  const b = nativeExecutionBoundary(source(), h.now);
  await h.controller.reconcile(b); assert.equal(h.schedules, 1);
  await h.controller.reconcile(nativeExecutionBoundary(source(), h.now)); assert.equal(h.schedules, 1);
  h.now += 1100; await h.controller.reconcile(nativeExecutionBoundary(source(), h.now));
  assert.equal(h.schedules, 1); assert.ok(h.ledger.consumed.includes(b.key));
  await h.controller.reconcile(b); assert.equal(h.schedules, 1);
});
test("a single execution slot preempts only the farthest task-start request, never a foreign owner", async () => {
  const h = harness();
  h.pending = Array.from({ length: 63 }, (_, i) => ({ id: i + 1, extra: { owner: "oddk.task-reminder.v1", signature: JSON.stringify(["local", i, "title", T, T + i * 60_000]) } }));
  h.pending.push({ id: 999, extra: { owner: "foreign" } });
  await h.controller.reconcile(nativeExecutionBoundary(source(), T));
  assert.equal(h.pending.length, 64); assert.ok(h.cancellations.includes(63)); assert.ok(h.pending.some(x => x.id === 999));
  assert.equal(h.pending.filter(x => x.extra.owner === EXECUTION_REMINDER_OWNER).length, 1);
});
test("a stale in-flight schedule is canceled after pause/scope invalidation", async () => {
  const h = harness(); let entered, release;
  const ready = new Promise(resolve => { entered = resolve; }); h.entered = entered; h.gate = new Promise(resolve => { release = resolve; });
  const scheduling = h.controller.reconcile(nativeExecutionBoundary(source(), T)); await ready;
  h.controller.invalidate(); release(); await scheduling;
  assert.equal(h.pending.length, 0); assert.equal(h.ledger.pending, null);
});
test("task and execution critical sections cannot interleave OS reservation operations", async () => {
  const calls = []; let release;
  const gate = new Promise(resolve => { release = resolve; });
  const first = withNativeNotificationLock(async () => { calls.push("task-start"); await gate; calls.push("task-end"); });
  const second = withNativeNotificationLock(async () => { calls.push("timer-start"); calls.push("timer-end"); });
  await Promise.resolve(); assert.deepEqual(calls, ["task-start"]); release(); await Promise.all([first, second]);
  assert.deepEqual(calls, ["task-start", "task-end", "timer-start", "timer-end"]);
});

test("a delivered current boundary stays visible without rescheduling and clears on pause/stop/OFF", async () => {
  const h = harness(); const boundary = nativeExecutionBoundary(source(), T);
  await h.controller.reconcile(boundary);
  h.delivered = h.pending; h.pending = []; h.now = T + 121_000;
  await h.controller.reconcile(boundary);
  assert.equal(h.delivered.length, 1); assert.equal(h.schedules, 1);
  assert.ok(h.ledger.consumed.includes(boundary.key));
  await h.controller.reconcile(null); assert.equal(h.delivered.length, 0);
});

test("rest edits rebook per current segment, an overdue limit alerts once, and the next rest may use the same limit again", async () => {
  const h = harness(), at = minutes => new Date(T + minutes * 60_000).toISOString();
  const resting = transitionExecution(record, "break", at(1));
  const projection = (value, limit) => nativeExecutionBoundary(source({ record: value, breakLimitMinutes: limit, breakSegmentKey: restAlertSegment(value).key }), h.now);
  h.now = T + 3 * 60_000;
  await h.controller.reconcile(projection(resting, 10));
  assert.equal(h.pending[0].schedule.at.getTime(), T + 11 * 60_000);
  await h.controller.reconcile(projection(resting, 5));
  assert.equal(h.pending.length, 1); assert.equal(h.pending[0].schedule.at.getTime(), T + 6 * 60_000);
  await h.controller.reconcile(projection(resting, 10));
  h.now = T + 7 * 60_000; await h.controller.reconcile(projection(resting, 5));
  assert.equal(h.pending[0].schedule.at.getTime(), h.now + 1000);
  const count = h.schedules; h.now += 1100; await h.controller.reconcile(projection(resting, 5));
  assert.equal(h.schedules, count);
  const next = transitionExecution(transitionExecution(resting, "resume", at(8)), "break", at(9));
  h.now = T + 9 * 60_000; await h.controller.reconcile(projection(next, 5));
  assert.equal(h.schedules, count + 1); assert.equal(h.pending[0].schedule.at.getTime(), T + 14 * 60_000);
  await h.controller.reconcile(nativeExecutionBoundary(source({ record: next, breakLimitMinutes: null }), h.now));
  assert.equal(h.pending.length, 0);
});
