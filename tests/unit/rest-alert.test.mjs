import test from "node:test";
import assert from "node:assert/strict";
import { startExecution, transitionExecution, executionTotals } from "../../supabase/functions/_shared/execution.ts";
import { bindRestAlert, confirmedRestStart, matchedRestAlert, parseRestAlert, restAlertSegment } from "../../app/todo/rest-alert.ts";
import { createRestAlertStore } from "../../app/todo/rest-alert-store.ts";
import { executionTimerProgress } from "../../app/todo/execution-timer.ts";
import { nativeExecutionBoundary } from "../../app/todo/native-execution-reminders.ts";
import { publishExecutionTimerSource, clearExecutionTimerSource, getExecutionTimerSource } from "../../app/todo/execution-timer-source.ts";

const T = Date.parse("2026-11-04T00:00:00Z"), at = n => new Date(T + n * 60000).toISOString();
const task = { id: "task", title: "작업", minutes: 30, bufferMinutes: 5, done: false, plannedDate: "2026-11-04" };
const seed = () => startExecution(task, "00000000-0000-4000-8000-000000000126", at(0));
function repeated() {
  let record = transitionExecution(seed(), "break", at(10));
  record = transitionExecution(record, "resume", at(15));
  return transitionExecution(record, "break", at(20));
}
function storeHarness() {
  const values = new Map(), storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  return { storage, store: createRestAlertStore(() => storage) };
}
test("this break is 2 minutes while cumulative rest is 7; editing affects no record/history and each break gets its own alert key", () => {
  const record = repeated(), before = JSON.stringify(record), now = at(22);
  const p = executionTimerProgress(record, task, now, 5);
  assert.equal(p.breakMs, 7 * 60000); assert.equal(p.restSegmentMs, 2 * 60000);
  assert.equal(p.remainingMs, 3 * 60000); assert.equal(p.deadlineAt, at(25));
  const longer = executionTimerProgress(record, task, now, 10); assert.equal(longer.deadlineAt, at(30));
  const shorter = executionTimerProgress(record, task, at(26), 5); assert.equal(shorter.overdueMs, 60000);
  const first = executionTimerProgress(transitionExecution(seed(), "break", at(10)), task, at(12), 5);
  assert.notEqual(first.alertKey, p.alertKey); assert.equal(JSON.stringify(record), before);
});
test("paused breaks freeze the current elapsed and cancel deadlines; existing resume keeps its work meaning", () => {
  const paused = transitionExecution(repeated(), "pause", at(22));
  const p = executionTimerProgress(paused, task, at(28), 5);
  assert.equal(p.phase, "paused"); assert.equal(p.restSegmentMs, 2 * 60000); assert.equal(p.deadlineAt, null);
  const resumed = transitionExecution(paused, "resume", at(28));
  assert.equal(executionTimerProgress(resumed, task, at(29), 5).phase, "work"); assert.equal(restAlertSegment(resumed), null);
});
test("confirmed break binding rejects old states, another scope, another record and intervening new segments", () => {
  const prior = seed(), resting = transitionExecution(prior, "break", at(1));
  assert.equal(confirmedRestStart("local", prior, "local", prior, 5), null);
  assert.equal(confirmedRestStart("local", prior, "other", resting, 5), null);
  assert.equal(confirmedRestStart("local", prior, "local", { ...resting, id: "00000000-0000-4000-8000-000000000127" }, 5), null);
  assert.equal(confirmedRestStart("local", prior, "local", repeated(), 5), null);
  assert.equal(confirmedRestStart("local", prior, "local", resting, 5).minutes, 5);
});
test("device-local selection restores only matching scope/record/segment across reload and survives loading, then prunes on stop/scope change/new segment", () => {
  const { store, storage } = storeHarness(), record = repeated();
  store.save("local", record, 10);
  const reloaded = createRestAlertStore(() => storage), binding = parseRestAlert(reloaded.getSnapshot());
  assert.equal(matchedRestAlert("local", record, binding).minutes, 10);
  reloaded.reconcile("local", null, false); assert.notEqual(reloaded.getSnapshot(), "");
  assert.equal(matchedRestAlert("other", record, binding), null);
  reloaded.reconcile("other", record, false); assert.equal(reloaded.getSnapshot(), "");
  store.save("local", record, 5); store.reconcile("local", transitionExecution(record, "stop", at(23)), true); assert.equal(store.getSnapshot(), "");
  store.save("local", record, 5);
  const next = transitionExecution(transitionExecution(record, "resume", at(23)), "break", at(24));
  assert.equal(matchedRestAlert("local", next, parseRestAlert(store.getSnapshot())), null);
  store.reconcile("local", next, true); assert.equal(store.getSnapshot(), "");
});
test("no-alert choice is explicit, invalid/corrupt storage is ignored, and failed save preserves the last confirmed choice", () => {
  const { store, storage } = storeHarness(), record = repeated();
  assert.equal(store.save("local", record, 0).minutes, null);
  assert.equal(parseRestAlert("{"), null); assert.equal(parseRestAlert('{"scope":"local","recordId":"r","segmentKey":"s","minutes":7}'), null);
  assert.throws(() => bindRestAlert("local", record, 7));
  store.save("local", record, 10); const before = store.getSnapshot();
  storage.setItem = () => { throw Error("full"); };
  assert.throws(() => store.save("local", record, 5), /저장하지 못했어요/); assert.equal(store.getSnapshot(), before);
});
test("native deadline consumes the same segment-bound source, rejects stale bindings and preserves the server clock offset", () => {
  const record = repeated(), binding = bindRestAlert("local", record, 5);
  const source = { scope: "local", record, task, clockOffsetMs: 1000, blocked: false, breakLimitMinutes: 5, breakSegmentKey: binding.segmentKey };
  const p = nativeExecutionBoundary(source, Date.parse(at(22)));
  assert.equal(p.deadline, Date.parse(at(25)) - 1000);
  assert.equal(nativeExecutionBoundary({ ...source, breakSegmentKey: "old" }, Date.parse(at(22))), null);
  publishExecutionTimerSource({ ...source, now: at(22), breakSegmentKey: "old" }); assert.equal(getExecutionTimerSource().breakLimitMinutes, null);
  publishExecutionTimerSource({ ...source, now: at(22) }); assert.equal(getExecutionTimerSource().breakLimitMinutes, 5);
  clearExecutionTimerSource("local");
  assert.equal(executionTotals(record, at(22)).breakMs, 7 * 60000);
});
