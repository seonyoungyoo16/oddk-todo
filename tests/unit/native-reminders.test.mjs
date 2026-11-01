import test from "node:test";
import assert from "node:assert/strict";
import { nativeReminderPlan, reminderExtra, NATIVE_REMINDER_OWNER } from "../../app/todo/native-reminder-model.ts";
import { createNativeReminderController } from "../../app/todo/native-reminder-controller.ts";
import { validPlan } from "../../supabase/functions/_shared/plan.ts";

const now = Date.parse("2026-11-01T00:00:00Z"); // 09:00 Korea
const task = (patch = {}) => ({ id: "a", title: "회의 준비", notes: "알림에 보내지 않을 메모", done: false, priority: "normal", plannedDate: "2026-11-01", minutes: 60, bufferMinutes: 10, startTime: "10:00", endTime: "11:00", endDate: "2026-11-01", endDayOffset: 0, reminderMinutes: 5, ...patch });
const plan = (tasks = [task()]) => ({ schemaVersion: 6, start: "09:00", tasks, reviewsByDate: {}, goalTree: { goal: "", groups: [] } });
const source = (tasks, scope = "local") => ({ scope, raw: JSON.stringify(plan(tasks)), blocked: false });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function harness() {
  const h = { source: source(), binding: null, permission: "prompt", promptCount: 0, pending: [], delivered: [], calls: [], states: [], clock: now };
  const port = {
    readBinding: async () => { if (h.corruptBinding) throw Error("corrupt binding"); return h.binding; },
    writeBinding: async value => { if (h.storageFailure) throw Error("storage full"); h.calls.push("persist"); h.binding = structuredClone(value); },
    checkPermissions: async () => ({ display: h.permission }),
    requestPermissions: async () => { h.promptCount++; if (h.permissionGate) await h.permissionGate.promise; h.permission = h.nextPermission ?? "granted"; return { display: h.permission }; },
    getPending: async () => ({ notifications: structuredClone(h.pending) }),
    getDeliveredNotifications: async () => ({ notifications: structuredClone(h.delivered) }),
    cancel: async ({ notifications }) => { h.calls.push("cancel"); if (h.cancelFailure) throw Error("cancel unavailable"); const ids = new Set(notifications.map(n => n.id)); h.pending = h.pending.filter(n => !ids.has(n.id)); },
    removeDeliveredNotifications: async ({ notifications }) => { h.calls.push("removeDelivered"); const ids = new Set(notifications.map(n => n.id)); h.delivered = h.delivered.filter(n => !ids.has(n.id)); },
    schedule: async ({ notifications }) => {
      h.calls.push("schedule"); if (h.scheduleGate) { h.enteredSchedule.resolve(); await h.scheduleGate.promise; }
      for (const item of notifications) { h.pending = h.pending.filter(n => n.id !== item.id); h.pending.push(structuredClone(item)); if (h.partialFailure) throw Error("native partial failure"); }
    },
  };
  h.controller = createNativeReminderController(port, () => h.source, state => h.states.push(state), () => h.clock);
  h.enable = () => h.controller.enable(); h.refresh = () => h.controller.refresh();
  h.edit = patch => { const p = JSON.parse(h.source.raw); p.tasks[0] = { ...p.tasks[0], ...patch }; h.source = { ...h.source, raw: JSON.stringify(p) }; assert.ok(validPlan(p)); };
  return h;
}

test("anonymous reminders use the existing Korean time and lead offset without sending notes", () => {
  const input = source(), before = structuredClone(input);
  const result = nativeReminderPlan(input, now);
  assert.equal(result.pending[0].schedule.at.toISOString(), "2026-11-01T00:55:00.000Z");
  assert.equal(result.pending[0].extra.scope, "local"); assert.equal(result.pending[0].extra.owner, NATIVE_REMINDER_OWNER);
  assert.equal(JSON.stringify(result).includes("알림에 보내지 않을 메모"), false);
  assert.deepEqual(input, before);
  const midnight = nativeReminderPlan(source([task({ startTime: "00:00", endTime: "01:00" })]), now - 86400000);
  assert.equal(midnight.pending[0].schedule.at.toISOString(), "2026-10-31T14:55:00.000Z");
});
test("only unfinished scheduled tasks with an explicit reminder are eligible; past alarms are not replayed", () => {
  for (const patch of [{ done: true }, { reminderMinutes: null }, { reminderMinutes: undefined }, { summaryOnly: true }]) assert.equal(nativeReminderPlan(source([task(patch)]), now).pending.length, 0);
  assert.equal(nativeReminderPlan(source(), now + 3600000).pending.length, 0);
  for (const value of [{ ...source(), raw: "broken" }, { ...source(), blocked: true }, { ...source(), scope: "unreadable-session" }]) assert.throws(() => nativeReminderPlan(value, now));
});
test("the nearest 64 future alarms are reserved; other plugins' slots and identifiers are preserved", () => {
  const tasks = Array.from({ length: 70 }, (_, i) => task({ id: `task-${i}`, plannedDate: `2026-11-${String(1 + Math.floor(i / 3)).padStart(2, "0")}`, endDate: `2026-11-${String(1 + Math.floor(i / 3)).padStart(2, "0")}` }));
  const first = nativeReminderPlan(source(tasks), now);
  assert.equal(first.pending.length, 64); assert.equal(first.deferred, 6);
  const reserved = first.pending[0].id;
  const result = nativeReminderPlan(source(tasks), now, [reserved]);
  assert.equal(result.pending.length, 63); assert.equal(result.deferred, 7);
  assert.equal(new Set(result.all.map(n => n.id)).size, 70);
  assert.equal(result.all.some(n => n.id === reserved), false);
  assert.ok(result.pending.every(n => n.id > 0 && n.id <= 2147483647));
  assert.ok(result.pending.every((n, i) => !i || result.pending[i - 1].schedule.at <= n.schedule.at));
});
test("initialization never prompts; explicit opt-in is durable before scheduling and repeated refresh is idempotent", async () => {
  const h = harness(); await h.refresh(); assert.equal(h.promptCount, 0); assert.equal(h.pending.length, 0);
  await h.enable(); assert.equal(h.promptCount, 1); assert.equal(h.pending.length, 1);
  assert.ok(h.calls.indexOf("persist") < h.calls.indexOf("schedule"));
  h.calls.length = 0; await h.refresh(); assert.deepEqual(h.calls, []);
  assert.equal(h.states.at(-1).enabled, true);
});
test("changing date, clock, lead time or title cancels the old request before scheduling its replacement", async () => {
  for (const patch of [{ plannedDate: "2026-11-02", endDate: "2026-11-02" }, { startTime: "11:00", endTime: "12:00" }, { reminderMinutes: 10 }, { title: "수정한 제목" }]) {
    const h = harness(); await h.enable(); const old = h.pending[0];
    h.edit(patch); h.calls.length = 0; await h.refresh();
    assert.equal(h.pending.length, 1); assert.equal(h.pending[0].id, old.id);
    assert.notEqual(h.pending[0].extra.signature, old.extra.signature);
    assert.deepEqual(h.calls, ["cancel", "schedule"]);
  }
});
test("complete, delete, clear reminder or clear schedule removes both pending and already delivered alerts", async () => {
  for (const edit of [h => h.edit({ done: true }), h => { h.source = source([]); }, h => h.edit({ reminderMinutes: null }), h => h.edit({ plannedDate: null, startTime: null, endTime: null, endDate: null, endDayOffset: null, reminderMinutes: null })]) {
    const h = harness(); await h.enable(); h.delivered = structuredClone(h.pending);
    edit(h); await h.refresh(); assert.equal(h.pending.length, 0); assert.equal(h.delivered.length, 0);
  }
});
test("undo restores a future alarm; a foreground refill never replays an elapsed alarm", async () => {
  const h = harness(); await h.enable(); const original = h.source;
  h.edit({ done: true }); await h.refresh(); assert.equal(h.pending.length, 0);
  h.source = original; await h.refresh(); assert.equal(h.pending.length, 1);
  h.clock = now + 7200000; await h.refresh(); assert.equal(h.pending.length, 0);
  await h.refresh(); assert.equal(h.pending.length, 0);
});
test("denied/revoked permission never prompts automatically or schedules; settings can retry", async () => {
  const h = harness(); h.nextPermission = "denied";
  await assert.rejects(h.enable(), /iPhone 설정/); assert.equal(h.binding, null); assert.equal(h.pending.length, 0);
  await h.refresh(); assert.equal(h.promptCount, 1);
  h.nextPermission = "granted"; await h.enable(); h.permission = "denied"; await h.refresh(); assert.equal(h.pending.length, 0);
});
test("switching accounts or a pending account deletion clears alerts and never inherits opt-in", async () => {
  for (const next of [{ ...source(), scope: "account-b" }, { ...source(), blocked: true }]) {
    const h = harness(); await h.enable(); h.delivered = structuredClone(h.pending);
    h.source = next; await h.refresh(); assert.equal(h.pending.length, 0); assert.equal(h.delivered.length, 0); assert.equal(h.binding.enabled, false);
    h.source = source(); await h.refresh(); assert.equal(h.pending.length, 0);
  }
});
test("an old in-flight schedule is canceled when completion or logout overtakes it", async () => {
  for (const logout of [false, true]) {
    const h = harness(); h.scheduleGate = deferred(); h.enteredSchedule = deferred();
    const first = h.enable(); await h.enteredSchedule.promise;
    let latest;
    if (logout) latest = h.controller.disable(); else { h.edit({ done: true }); latest = h.refresh(); }
    h.scheduleGate.resolve(); await first; await latest;
    assert.equal(h.pending.length, 0); assert.equal(h.states.at(-1).enabled, !logout);
  }
});
test("permission responses from an old account cannot opt a different account into alerts", async () => {
  const h = harness(); h.permissionGate = deferred(); const enabling = h.enable();
  h.source = { ...source(), scope: "b" }; h.permissionGate.resolve();
  await assert.rejects(enabling, /계정이 바뀌었어요/); assert.equal(h.binding, null); assert.equal(h.pending.length, 0);
});
test("storage, corrupt binding and partial schedule failures retain the source and expose a retryable error", async () => {
  const h = harness(); h.storageFailure = true;
  await assert.rejects(h.enable()); assert.equal(h.pending.length, 0);
  h.storageFailure = false; await h.enable(); const before = h.source;
  h.corruptBinding = true; await assert.rejects(h.refresh()); assert.equal(h.pending.length, 0); assert.ok(h.states.at(-1).error);
  h.corruptBinding = false; h.partialFailure = true;
  await assert.rejects(h.refresh()); assert.equal(h.pending.length, 0); assert.deepEqual(h.source, before);
  h.partialFailure = false; await h.refresh(); assert.equal(h.pending.length, 1); assert.equal(h.states.at(-1).error, "");
});
test("explicit opt-out persists across restart and never cancels another feature's notification", async () => {
  const h = harness(); h.pending.push({ id: 1, extra: { owner: "another-feature" } }); await h.enable();
  h.delivered = structuredClone(h.pending); await h.controller.disable();
  assert.equal(h.binding.enabled, false); assert.deepEqual(h.pending.map(n => n.id), [1]); assert.deepEqual(h.delivered.map(n => n.id), [1]);
  await h.refresh(); assert.equal(h.pending.length, 1); assert.equal(h.states.at(-1).enabled, false);
  assert.equal(reminderExtra(h.pending[0]), null);
});
