import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { startExecution, transitionExecution } from "../../supabase/functions/_shared/execution.ts";
import { createNativeExecutionReminderController, nativeExecutionBoundary } from "../../app/todo/native-execution-reminders.ts";
import { withNativeNotificationLock } from "../../app/todo/native-notification-lock.ts";

const js = ts.transpileModule(readFileSync(new URL("../../app/todo/native-execution-runtime.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const tick = () => new Promise(setImmediate);
function harness(platform = "ios", available = true) {
  const task = { id: "task", title: "집중", plannedDate: "2026-11-03", minutes: 60, bufferMinutes: 10, done: false };
  const record = startExecution(task, "00000000-0000-4000-8000-000000000456", new Date().toISOString());
  const h = { source: { scope: "local", record, task, clockOffsetMs: 0, blocked: false, breakLimitMinutes: null }, gate: { scope: "local", enabled: true, blocked: false }, permission: "granted", pending: [], preferences: new Map(), events: new Map(), timers: new Map(), calls: 0, schedules: 0, changed: 0, errors: [] };
  const events = { addEventListener: (name, fn) => h.events.set(name, fn), removeEventListener: name => h.events.delete(name) };
  const exports = {};
  vm.runInNewContext(js, { exports, Date, JSON, window: { ...events, setInterval: fn => { h.timers.set(1, fn); return 1; }, clearInterval: id => h.timers.delete(id) }, document: events, require: name => {
    if (name === "@capacitor/core") return { Capacitor: { getPlatform: () => platform, isPluginAvailable: () => available } };
    if (name === "@capacitor/preferences") return { Preferences: { get: async ({ key }) => { h.calls++; return { value: h.preferences.get(key) ?? null }; }, set: async ({ key, value }) => { h.preferences.set(key, value); } } };
    if (name === "@capacitor/local-notifications") return { LocalNotifications: {
      checkPermissions: async () => { h.calls++; if (h.permissionGate) { h.enteredPermission?.(); await h.permissionGate; } return { display: h.permission }; },
      getPending: async () => ({ notifications: structuredClone(h.pending) }), getDeliveredNotifications: async () => ({ notifications: [] }),
      cancel: async ({ notifications }) => { const ids = new Set(notifications.map(x => x.id)); h.pending = h.pending.filter(x => !ids.has(x.id)); },
      removeDeliveredNotificationsById: async () => {},
      schedule: async ({ notifications }) => { h.schedules++; h.pending.push(...structuredClone(notifications)); },
    } };
    if (name === "./execution-timer-source") return { getExecutionTimerSource: () => h.source, subscribeExecutionTimerSource: fn => { h.sourceChanged = fn; return () => { h.sourceChanged = null; }; } };
    if (name === "./native-execution-reminders") return { createNativeExecutionReminderController, nativeExecutionBoundary };
    if (name === "./native-notification-lock") return { withNativeNotificationLock };
    throw Error(`Unexpected import ${name}`);
  } });
  h.api = exports;
  h.start = () => exports.startNativeExecutionRuntime({ readGate: () => h.gate, subscribeGate: fn => { h.gateChanged = fn; return () => { h.gateChanged = null; }; }, onReservationsChanged: () => { h.changed++; }, onError: error => h.errors.push(error) });
  return h;
}

test("native runtime follows the shared source through view changes, pause, resume, and scope clearing", async () => {
  const h = harness(), stop = h.start(); await tick();
  assert.equal(h.pending.length, 1); assert.equal(h.schedules, 1);
  h.sourceChanged(); await tick(); // menu/view publications keep the same execution and deadline
  assert.equal(h.pending.length, 1); assert.equal(h.schedules, 1);
  const record = h.source.record;
  h.source = { ...h.source, record: transitionExecution(record, "pause", new Date().toISOString()) };
  h.sourceChanged(); await tick(); assert.equal(h.pending.length, 0);
  h.source = { ...h.source, record: transitionExecution(h.source.record, "resume", new Date().toISOString()) };
  h.sourceChanged(); await tick(); assert.equal(h.pending.length, 1);
  h.gate = { ...h.gate, scope: "other" }; h.gateChanged(); await tick(); assert.equal(h.pending.length, 0);
  h.source = null; h.sourceChanged(); await tick(); assert.equal(h.pending.length, 0); assert.deepEqual(h.errors, []);
  stop(); assert.equal(h.sourceChanged, null); assert.equal(h.gateChanged, null); assert.equal(h.events.size, 0); assert.equal(h.timers.size, 0);
});

test("device OFF, permission revocation, and account deletion cancel timer reservations without permission prompts", async () => {
  const h = harness(), stop = h.start(); await tick();
  h.gate = { ...h.gate, enabled: false }; h.gateChanged(); await tick(); assert.equal(h.pending.length, 0);
  h.gate = { ...h.gate, enabled: true }; h.gateChanged(); await tick(); assert.equal(h.pending.length, 1);
  h.permission = "denied"; h.events.get("focus")(); await tick(); assert.equal(h.pending.length, 0);
  h.permission = "granted"; h.gateChanged(); await tick(); assert.equal(h.pending.length, 1);
  h.gate = { ...h.gate, blocked: true }; h.gateChanged(); await tick(); assert.equal(h.pending.length, 0);
  stop(); assert.deepEqual(h.errors, []);
});

test("browser, Android and unsupported iPhone do not touch notification/preferences APIs", async () => {
  for (const [platform, available] of [["web", true], ["android", true], ["ios", false]]) {
    const h = harness(platform, available), stop = h.start(); await tick();
    await h.api.cancelNativeExecutionRemindersUnlocked(); stop();
    assert.equal(h.calls, 0); assert.equal(h.schedules, 0); assert.equal(h.events.size, 0); assert.equal(h.timers.size, 0);
  }
});

test("a slow native permission check cannot schedule an old scope after OFF or source clearing", async () => {
  const h = harness(); let release, entered;
  const ready = new Promise(resolve => { entered = resolve; });
  h.enteredPermission = entered; h.permissionGate = new Promise(resolve => { release = resolve; });
  const stop = h.start(); await ready;
  h.gate = { scope: "other", enabled: false, blocked: false }; h.source = null;
  h.gateChanged(); h.sourceChanged(); release(); await tick();
  assert.equal(h.schedules, 0); assert.equal(h.pending.length, 0); assert.deepEqual(h.errors, []); stop();
});
