import { nativeReminderPlan, reminderExtra } from "./native-reminder-model.ts";
import type { NativeReminder, ObservedReminder, ReminderSource } from "./native-reminder-model.ts";

export type ReminderState = { enabled: boolean; permission: string; pending: number; deferred: number; error: string; phase: "checking" | "changing" | "ready" | "error"; cleanupPending: boolean };
export const EMPTY_REMINDER_STATE: ReminderState = { enabled: false, permission: "prompt", pending: 0, deferred: 0, error: "", phase: "checking", cleanupPending: false };
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
  let state = EMPTY_REMINDER_STATE, stateScope: string | undefined;
  const emit = (next: ReminderState) => { state = next; stateScope = read().scope; publish(next); };
  const failure = (error: unknown) => error instanceof Error && /[가-힣]/.test(error.message) ? error.message : "알림 변경을 완료하지 못했어요. 다시 시도해주세요.";
  const enqueue = (work: () => Promise<void>) => {
    const result = queue.then(work);
    queue = result.catch(() => {});
    return result;
  };
  async function remove(pending: ObservedReminder[], delivered: ObservedReminder[]) {
    if (pending.length) await port.cancel({ notifications: pending.map(({ id }) => ({ id })) });
    if (delivered.length) await port.removeDeliveredNotifications({ notifications: delivered.map(({ id }) => ({ id })) });
  }
  async function confirmRemoved() {
    const pending = (await port.getPending()).notifications.some(item => reminderExtra(item));
    const delivered = (await port.getDeliveredNotifications()).notifications.some(item => reminderExtra(item));
    if (pending || delivered) throw Error("일부 기기 알림이 남아 있어요. 다시 꺼주세요.");
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
      await confirmRemoved();
      if (current()) emit({ ...EMPTY_REMINDER_STATE, permission, phase: "ready" });
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
    const confirmed = (await port.getPending()).notifications.filter(item => reminderExtra(item));
    if (!current()) return;
    const future = plan.pending.filter(item => item.schedule.at.getTime() > now());
    if (future.some(item => !confirmed.some(actual => actual.id === item.id && reminderExtra(actual)?.signature === item.extra.signature))
      || confirmed.some(item => expected.get(item.id) !== reminderExtra(item)?.signature)) throw Error("기기 알림 예약을 확인하지 못했어요. 다시 시도해주세요.");
    if (current()) emit({ ...EMPTY_REMINDER_STATE, enabled: true, permission, pending: plan.pending.length, deferred: plan.deferred, phase: "ready" });
  }
  function refresh() {
    const version = ++revision;
    if (read().scope !== stateScope || read().blocked) emit({ ...EMPTY_REMINDER_STATE });
    return enqueue(async () => {
      try { await reconcile(version); }
      catch (error) {
        if (version === revision) {
          // A corrupt binding or a partial native schedule must not leave old alarms active.
          let cleanupPending = false;
          try { await remove((await port.getPending()).notifications.filter(item => reminderExtra(item)), (await port.getDeliveredNotifications()).notifications.filter(item => reminderExtra(item))); await confirmRemoved(); } catch { cleanupPending = true; }
          if (version === revision) emit({ ...EMPTY_REMINDER_STATE, permission: state.permission, phase: "error", cleanupPending, error: cleanupPending ? "일부 기기 알림을 취소하지 못했어요. 다시 시도해주세요." : failure(error) });
        }
        throw error;
      }
    });
  }
  async function enable() {
    const requested = read(), selected = ++action;
    let permission = state.permission;
    try {
      if (requested.blocked || requested.scope === "unreadable-session") throw Error("계정과 저장된 계획을 먼저 확인해주세요.");
      emit({ ...state, phase: "changing", error: "" });
      // Permission is requested only by an explicit ON action, never by refresh.
      permission = (await port.requestPermissions()).display;
      if (selected !== action || read().scope !== requested.scope || read().blocked) throw Error("계정이 바뀌었어요. 현재 계정에서 알림을 다시 켜주세요.");
      if (permission !== "granted") {
        await refresh();
        throw Error("iPhone 설정 → 알림 → oddk에서 알림을 허용한 뒤 다시 켜주세요.");
      }
      await enqueue(async () => {
        if (selected !== action || read().scope !== requested.scope || read().blocked) throw Error("계정이 바뀌었어요. 현재 계정에서 알림을 다시 켜주세요.");
        await port.writeBinding({ scope: requested.scope, enabled: true });
      });
      await refresh();
    } catch (error) {
      if (selected === action && read().scope === requested.scope) emit({ ...EMPTY_REMINDER_STATE, permission, phase: "error", cleanupPending: state.cleanupPending, error: state.cleanupPending ? "일부 기기 알림을 취소하지 못했어요. 다시 시도해주세요." : failure(error) });
      throw error;
    }
  }
  async function disable() {
    const requested = read(), selected = ++action;
    ++revision;
    emit({ ...state, phase: "changing", error: "" });
    await enqueue(async () => {
      if (selected !== action || read().scope !== requested.scope) throw Error("계정이 바뀌었어요. 현재 계정에서 알림을 다시 확인해주세요.");
      try {
        // Persist opt-out before cleanup: relaunch must never reschedule it.
        await port.writeBinding({ scope: requested.scope, enabled: false });
        const pending = (await port.getPending()).notifications.filter(item => reminderExtra(item));
        const delivered = (await port.getDeliveredNotifications()).notifications.filter(item => reminderExtra(item));
        await remove(pending, delivered);
        await confirmRemoved();
        const permission = (await port.checkPermissions()).display;
        if (selected === action && read().scope === requested.scope) emit({ ...EMPTY_REMINDER_STATE, permission, phase: "ready" });
      } catch (error) {
        if (selected === action && read().scope === requested.scope) emit({ ...EMPTY_REMINDER_STATE, permission: state.permission, phase: "error", cleanupPending: true, error: "기기 알림 끄기를 완료하지 못했어요. 다시 시도해주세요." });
        throw error;
      }
    });
  }
  return { refresh, enable, disable, invalidate: () => { ++revision; ++action; } };
}
