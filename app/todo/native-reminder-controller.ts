import { nativeReminderPlan, reminderExtra } from "./native-reminder-model.ts";
import type { NativeReminder, ObservedReminder, ReminderSource } from "./native-reminder-model.ts";

export type ReminderState = { enabled: boolean; permission: string; pending: number; deferred: number; error: string };
export const EMPTY_REMINDER_STATE: ReminderState = { enabled: false, permission: "prompt", pending: 0, deferred: 0, error: "" };
export type ReminderBinding = { scope: string; enabled: boolean };
export type ReminderPort = {
  checkPermissions(): Promise<{ display: string }>;
  requestPermissions(): Promise<{ display: string }>;
  getPending(): Promise<{ notifications: ObservedReminder[] }>;
  getDeliveredNotifications(): Promise<{ notifications: ObservedReminder[] }>;
  cancel(options: { notifications: { id: number }[] }): Promise<void>;
  removeDeliveredNotifications(options: { notifications: { id: number }[] }): Promise<void>;
  schedule(options: { notifications: NativeReminder[] }): Promise<unknown>;
  readBinding(): Promise<ReminderBinding | null>;
  writeBinding(binding: ReminderBinding): Promise<void>;
};

// Serialize native calls. A slower old plan must never replace a newer edit or logout.
export function createNativeReminderController(port: ReminderPort, read: () => ReminderSource, publish: (state: ReminderState) => void, now = Date.now) {
  let queue = Promise.resolve(), revision = 0, action = 0;
  const enqueue = (work: () => Promise<void>) => {
    const result = queue.then(work);
    queue = result.catch(() => {});
    return result;
  };
  async function remove(pending: ObservedReminder[], delivered: ObservedReminder[]) {
    if (pending.length) await port.cancel({ notifications: pending.map(({ id }) => ({ id })) });
    if (delivered.length) await port.removeDeliveredNotifications({ notifications: delivered.map(({ id }) => ({ id })) });
  }
  async function reconcile(version: number) {
    if (version !== revision) return;
    const source = read(), sourceKey = JSON.stringify(source);
    const current = () => version === revision && JSON.stringify(read()) === sourceKey;
    const binding = await port.readBinding();
    const { display: permission } = await port.checkPermissions();
    const pending = (await port.getPending()).notifications;
    const delivered = (await port.getDeliveredNotifications()).notifications;
    const owned = pending.filter(item => reminderExtra(item));
    const shown = delivered.filter(item => reminderExtra(item));
    if (!current()) return;
    const enabled = !!binding?.enabled && binding.scope === source.scope;
    if (!enabled || permission !== "granted" || source.blocked) {
      // Never inherit another account's opt-in, including the anonymous plan.
      if (binding?.enabled && (binding.scope !== source.scope || source.blocked)) await port.writeBinding({ scope: source.scope, enabled: false });
      await remove(owned, shown);
      if (current()) publish({ ...EMPTY_REMINDER_STATE, permission });
      return;
    }
    let plan: ReturnType<typeof nativeReminderPlan>;
    try { plan = nativeReminderPlan(source, now(), pending.filter(item => !reminderExtra(item)).map(item => item.id)); }
    catch (error) { await remove(owned, shown); throw error; }
    const expected = new Map(plan.pending.map(item => [item.id, item.extra.signature]));
    const validShown = new Set(plan.all.map(item => item.extra.signature));
    const obsolete = owned.filter(item => expected.get(item.id) !== reminderExtra(item)?.signature);
    await remove(obsolete, shown.filter(item => !validShown.has(reminderExtra(item)!.signature)));
    if (!current()) return;
    const existing = new Map(owned.filter(item => !obsolete.includes(item)).map(item => [item.id, reminderExtra(item)!.signature]));
    const additions = plan.pending.filter(item => existing.get(item.id) !== item.extra.signature && item.schedule.at.getTime() > now());
    if (additions.length) {
      await port.schedule({ notifications: additions });
      if (!current()) { await port.cancel({ notifications: additions.map(({ id }) => ({ id })) }); return; }
    }
    if (current()) publish({ enabled: true, permission, pending: plan.pending.length, deferred: plan.deferred, error: "" });
  }
  function refresh() {
    const version = ++revision;
    return enqueue(async () => {
      try { await reconcile(version); }
      catch (error) {
        if (version === revision) {
          // A corrupt binding or a partial native schedule must not leave old alarms active.
          try { await remove((await port.getPending()).notifications.filter(item => reminderExtra(item)), (await port.getDeliveredNotifications()).notifications.filter(item => reminderExtra(item))); } catch { /* Keep the error visible; retry on resume and explicit refresh. */ }
          publish({ ...EMPTY_REMINDER_STATE, error: error instanceof Error && /[가-힣]/.test(error.message) ? error.message : "일정 알림을 반영하지 못했어요. 할 일은 저장돼 있어요. 알림 상태를 다시 확인해주세요." });
        }
        throw error;
      }
    });
  }
  async function enable() {
    const requested = read(), selected = ++action;
    if (requested.blocked || requested.scope === "unreadable-session") throw Error("계정과 저장된 계획을 먼저 확인해주세요.");
    // The only permission prompt is reached from the explicit settings button.
    const permission = await port.requestPermissions();
    if (permission.display !== "granted") throw Error("iPhone 설정 → 알림 → oddk에서 알림을 허용한 뒤 다시 켜주세요.");
    if (selected !== action || read().scope !== requested.scope || read().blocked) throw Error("계정이 바뀌었어요. 현재 계정에서 알림을 다시 켜주세요.");
    await enqueue(async () => {
      if (selected !== action || read().scope !== requested.scope || read().blocked) throw Error("계정이 바뀌었어요. 현재 계정에서 알림을 다시 켜주세요.");
      await port.writeBinding({ scope: requested.scope, enabled: true });
    });
    await refresh();
  }
  async function disable() {
    ++action; ++revision;
    await enqueue(async () => {
      // Persist the opt-out before native cleanup; a retry/relaunch must not reschedule.
      await port.writeBinding({ scope: read().scope, enabled: false });
      const pending = (await port.getPending()).notifications.filter(item => reminderExtra(item));
      const delivered = (await port.getDeliveredNotifications()).notifications.filter(item => reminderExtra(item));
      await remove(pending, delivered);
      publish({ ...EMPTY_REMINDER_STATE, permission: (await port.checkPermissions()).display });
    });
  }
  return { refresh, enable, disable, invalidate: () => { ++revision; ++action; } };
}
