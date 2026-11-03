import test from "node:test";
import assert from "node:assert/strict";
import { getExecutionTimerSource, subscribeExecutionTimerSource, publishExecutionTimerSource, clearExecutionTimerSource } from "../../app/todo/execution-timer-source.ts";

test("plan edits and menu-independent republishing retain the confirmed clock offset; scope cleanup is guarded", () => {
  const originalNow = Date.now;
  let received = Date.parse("2026-11-03T00:00:05Z"), calls = 0;
  Date.now = () => received;
  const unsubscribe = subscribeExecutionTimerSource(() => calls++);
  try {
    const source = { scope: "local", record: null, task: null, now: "2026-11-03T00:00:00.000Z", blocked: false, breakLimitMinutes: null };
    publishExecutionTimerSource(source);
    assert.equal(getExecutionTimerSource().clockOffsetMs, -5000);
    received += 15000;
    publishExecutionTimerSource({ ...source, task: { id: "edited" } });
    assert.equal(getExecutionTimerSource().clockOffsetMs, -5000, "editing a plan cannot restart the confirmed clock");
    publishExecutionTimerSource({ ...source, now: "2026-11-03T00:00:18.000Z" });
    assert.equal(getExecutionTimerSource().clockOffsetMs, -2000);
    publishExecutionTimerSource({ ...source, scope: "account" });
    clearExecutionTimerSource("local");
    assert.equal(getExecutionTimerSource().scope, "account");
    assert.equal(getExecutionTimerSource().clockOffsetMs, -20000);
    clearExecutionTimerSource("account"); assert.equal(getExecutionTimerSource(), null);
    assert.equal(calls, 5);
    publishExecutionTimerSource({ ...source, now: null }); assert.equal(getExecutionTimerSource().blocked, true);
  } finally { unsubscribe(); clearExecutionTimerSource("local"); Date.now = originalNow; }
  assert.equal(calls, 6);
});
