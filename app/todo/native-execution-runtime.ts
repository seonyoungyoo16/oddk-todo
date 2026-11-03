import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { LocalNotifications } from "@capacitor/local-notifications";
import { getExecutionTimerSource, subscribeExecutionTimerSource } from "./execution-timer-source";
import { createNativeExecutionReminderController, nativeExecutionBoundary } from "./native-execution-reminders";
import type { ExecutionReminderLedger } from "./native-execution-reminders";
import { withNativeNotificationLock } from "./native-notification-lock";

const KEY = "oddk.native-execution-alerts.v1";
const supported = () => Capacitor.getPlatform() === "ios" && Capacitor.isPluginAvailable("LocalNotifications");
const controller = createNativeExecutionReminderController({
  getPending: () => LocalNotifications.getPending(),
  getDelivered: () => LocalNotifications.getDeliveredNotifications(),
  cancel: async ids => { if (ids.length) await LocalNotifications.cancel({ notifications: ids.map(id => ({ id })) }); },
  removeDelivered: async ids => { if (ids.length) await LocalNotifications.removeDeliveredNotificationsById({ ids }); },
  schedule: async alert => { await LocalNotifications.schedule({ notifications: [alert] }); },
  readLedger: async () => {
    const { value } = await Preferences.get({ key: KEY });
    return value === null ? null : JSON.parse(value) as ExecutionReminderLedger;
  },
  writeLedger: async ledger => { await Preferences.set({ key: KEY, value: JSON.stringify(ledger) }); },
});

/** Called by the device OFF transaction while it already owns the shared OS lock. */
export async function cancelNativeExecutionRemindersUnlocked() {
  if (!supported()) return;
  controller.invalidate();
  await controller.reconcile(null);
}

export function startNativeExecutionRuntime(options: {
  readGate: () => { scope: string; enabled: boolean; blocked: boolean };
  subscribeGate: (notify: () => void) => () => void;
  onReservationsChanged: () => void;
  onError: (message: string) => void;
}) {
  if (!supported()) return () => {};
  let active = true, queued = false, nextTickAt = 0;
  const request = (changed = true) => {
    if (!active || !changed && Date.now() < nextTickAt) return;
    if (changed) controller.invalidate();
    if (queued) return;
    queued = true;
    void withNativeNotificationLock(async () => {
      queued = false;
      if (!active) return { changed: false, deadline: null };
      try {
        const permission = options.readGate().enabled ? (await LocalNotifications.checkPermissions()).display : "unknown";
        // Permission checks may yield across logout, OFF or a confirmed timer edit.
        // Capture the latest shared state after the native call, not before it.
        const gate = options.readGate(), source = getExecutionTimerSource();
        const boundary = gate.enabled && permission === "granted" && !gate.blocked && source?.scope === gate.scope ? nativeExecutionBoundary(source) : null;
        return { changed: await controller.reconcile(boundary), deadline: boundary?.deadline ?? null };
      } catch (error) { await controller.reconcile(null); throw error; }
    }).then(result => {
      const now = Date.now();
      nextTickAt = result.changed ? now + 1100 : result.deadline !== null && result.deadline > now ? Math.min(now + 60_000, result.deadline + 1100) : now + 60_000;
      if (active && result.changed) options.onReservationsChanged();
    }).catch(() => {
      nextTickAt = Date.now() + 15_000;
      if (active) options.onError("타이머 알림을 반영하지 못했어요. 기기 알림 상태를 확인해주세요.");
    });
  };
  const changed = () => request(true), tick = () => request(false);
  const stopSource = subscribeExecutionTimerSource(changed), stopGate = options.subscribeGate(changed);
  const timer = window.setInterval(tick, 1000);
  window.addEventListener("focus", changed); document.addEventListener("visibilitychange", changed);
  request();
  return () => {
    active = false; controller.invalidate(); stopSource(); stopGate(); window.clearInterval(timer);
    window.removeEventListener("focus", changed); document.removeEventListener("visibilitychange", changed);
  };
}
