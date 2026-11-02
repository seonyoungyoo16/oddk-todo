import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { createNativeReminderController, EMPTY_REMINDER_STATE } from "../../app/todo/native-reminder-controller.ts";
import { nativeReminderPlan, reminderExtra } from "../../app/todo/native-reminder-model.ts";

const js = ts.transpileModule(readFileSync(new URL("../../app/todo/native-reminders.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const tick = () => new Promise(setImmediate);
function harness(platform = "ios", available = true) {
  const date = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const task = { id: "task", title: "일정 알림 연결 확인", notes: "", priority: "normal", done: false, plannedDate: date, startTime: "10:00", minutes: 60, bufferMinutes: 10, endTime: "11:00", endDate: date, endDayOffset: 0, reminderMinutes: 5 };
  const h = { source: { scope: "local", blocked: false, raw: JSON.stringify({ schemaVersion: 6, tasks: [task], start: "09:00", reviewsByDate: {}, goalTree: { goal: "", groups: [] } }) }, pending: [], delivered: [], preferences: new Map(), listeners: new Map(), events: new Map(), timers: new Map(), prompts: 0, apiCalls: 0, navigation: [], removed: 0, subscriptions: 0 };
  const notifications = {
    checkPermissions: async () => { h.apiCalls++; return { display: "granted" }; },
    requestPermissions: async () => { h.prompts++; if (h.permissionGate) await h.permissionGate; return { display: "granted" }; },
    getPending: async () => ({ notifications: structuredClone(h.pending) }),
    getDeliveredNotifications: async () => ({ notifications: structuredClone(h.delivered) }),
    schedule: async ({ notifications }) => { h.pending.push(...structuredClone(notifications)); },
    cancel: async ({ notifications }) => { const ids = new Set(notifications.map(n => n.id)); h.pending = h.pending.filter(n => !ids.has(n.id)); },
    removeDeliveredNotificationsById: async ({ ids }) => { h.delivered = h.delivered.filter(n => !ids.includes(n.id)); },
    addListener: async (name, listener) => { h.listeners.set(name, listener); return { remove: async () => { h.listeners.delete(name); h.removed++; } }; },
  };
  const events = { addEventListener: (name, listener) => h.events.set(name, listener), removeEventListener: name => h.events.delete(name) };
  const exports = {};
  vm.runInNewContext(js, { exports, JSON, Date, URL, process: { env: {} }, window: { ...events, setInterval: fn => { h.timers.set(1, fn); return 1; }, clearInterval: id => h.timers.delete(id), location: { origin: "capacitor://localhost", assign: url => h.navigation.push(url) } }, document: events, require: name => {
    if (name === "@capacitor/core") return { Capacitor: { getPlatform: () => platform, isPluginAvailable: () => available } };
    if (name === "@capacitor/preferences") return { Preferences: { get: async ({ key }) => ({ value: h.preferences.get(key) ?? null }), set: async ({ key, value }) => { h.preferences.set(key, value); } } };
    if (name === "@capacitor/local-notifications") return { LocalNotifications: notifications };
    if (name === "./native-reminder-controller") return { createNativeReminderController, EMPTY_REMINDER_STATE };
    if (name === "./native-reminder-model") return { nativeReminderPlan, reminderExtra };
    throw Error(`Unexpected import ${name}`);
  } });
  h.api = exports;
  h.start = () => exports.startNativeReminders(() => h.source, notify => { h.notify = notify; h.subscriptions++; return () => { h.subscriptions--; }; });
  return h;
}
test("the native adapter subscribes to plan commits and applies edit/complete/delete without a server or a new permission prompt", async () => {
  const h = harness(); const stop = h.start();
  await h.api.refreshNativeReminders(); assert.equal(h.prompts, 0);
  await h.api.enableNativeReminders(); assert.equal(h.pending.length, 1); assert.equal(h.prompts, 1);
  const before = h.pending[0].extra.signature;
  const plan = JSON.parse(h.source.raw); plan.tasks[0].startTime = "11:00"; plan.tasks[0].endTime = "12:00";
  h.source = { ...h.source, raw: JSON.stringify(plan) }; h.notify(); await tick();
  assert.equal(h.pending.length, 1); assert.notEqual(h.pending[0].extra.signature, before);
  h.delivered = structuredClone(h.pending); plan.tasks[0].done = true;
  h.source = { ...h.source, raw: JSON.stringify(plan) }; h.notify(); await tick();
  assert.equal(h.pending.length, 0); assert.equal(h.delivered.length, 0);
  plan.tasks = []; h.source = { ...h.source, raw: JSON.stringify(plan) }; h.notify(); await tick();
  assert.equal(h.pending.length, 0); assert.equal(h.prompts, 1);
  stop(); await tick(); assert.equal(h.subscriptions, 0); assert.equal(h.listeners.size, 0); assert.equal(h.timers.size, 0); assert.equal(h.events.size, 0);
});
test("notification taps open the matching date only for a current unfinished task in the same scope", async () => {
  const h = harness(); const stop = h.start(); await h.api.enableNativeReminders();
  const notification = structuredClone(h.pending[0]);
  h.listeners.get("localNotificationActionPerformed")({ notification });
  assert.match(h.navigation[0], /^capacitor:\/\/localhost\/todo\/\?reminder-date=\d{4}-\d{2}-\d{2}$/);
  h.source = { ...h.source, scope: "other-account" };
  h.listeners.get("localNotificationActionPerformed")({ notification }); assert.equal(h.navigation.length, 1);
  stop();
});
test("web, Android, and an older iPhone shell never call native notification APIs or ask for permission", async () => {
  for (const [platform, available] of [["web", true], ["android", true], ["ios", false]]) {
    const h = harness(platform, available), stop = h.start();
    await h.api.refreshNativeReminders(); await h.api.disableNativeReminders();
    assert.equal(h.prompts, 0); assert.equal(h.apiCalls, 0); assert.equal(h.listeners.size, 0); assert.equal(h.preferences.size, 0);
    const state = JSON.parse(h.api.getNativeReminderSnapshot()); assert.equal(state.native, platform === "ios" || platform === "android"); assert.equal(state.available, false); assert.equal(state.phase, "ready");
    stop();
  }
});
test("a relaunch restores the native opt-in without prompting and an empty new plan can enable alarms", async () => {
  const first = harness(); const stop = first.start(); await first.api.enableNativeReminders(); stop();
  const next = harness(); next.preferences = first.preferences; // The adapter closes over the harness object, like Preferences across process starts.
  const stopNext = next.start(); await next.api.refreshNativeReminders(); assert.equal(next.pending.length, 1); assert.equal(next.prompts, 0); stopNext();
  const empty = harness(); const p = JSON.parse(empty.source.raw); p.tasks = []; p.schemaVersion = 5; empty.source.raw = JSON.stringify(p);
  const stopEmpty = empty.start(); await empty.api.enableNativeReminders(); assert.equal(empty.pending.length, 0); assert.equal(JSON.parse(empty.api.getNativeReminderSnapshot()).enabled, true); stopEmpty();
});

test("shared adapter rejects cross-entry duplicate mutations while the OS permission request is pending", async () => {
  const h = harness(); const stop = h.start(); await h.api.refreshNativeReminders();
  let release; h.permissionGate = new Promise(resolve => { release = resolve; });
  const first = h.api.enableNativeReminders();
  await assert.rejects(h.api.enableNativeReminders(), /변경 중/);
  assert.equal(h.prompts, 1);
  release(); await first;
  assert.equal(JSON.parse(h.api.getNativeReminderSnapshot()).enabled, true);
  stop();
});

test("Android native exposes compact unsupported native state without calling any notification or preference API", async () => {
  const h = harness("android"), stop = h.start();
  const state = JSON.parse(h.api.getNativeReminderSnapshot());
  assert.equal(state.native, true); assert.equal(state.available, false);
  assert.equal(state.enabled, false); assert.equal(state.phase, "ready");
  await assert.rejects(h.api.enableNativeReminders());
  await h.api.disableNativeReminders(); await h.api.refreshNativeReminders();
  assert.equal(h.prompts, 0); assert.equal(h.apiCalls, 0); assert.equal(h.pending.length, 0);
  assert.equal(h.preferences.size, 0); assert.equal(h.listeners.size, 0);
  stop();
});
