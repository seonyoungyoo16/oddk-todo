import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { LocalNotifications } from "@capacitor/local-notifications";
import { createNativeReminderController, EMPTY_REMINDER_STATE } from "./native-reminder-controller";
import { nativeReminderPlan, reminderExtra } from "./native-reminder-model";
import type { ReminderBinding, ReminderState } from "./native-reminder-controller";
import type { ReminderSource } from "./native-reminder-model";

const BINDING_KEY = "oddk.native-reminders.v1";
type Status = ReminderState & { native: boolean; available: boolean };
const initial: Status = { ...EMPTY_REMINDER_STATE, native: false, available: false };
const serverSnapshot = JSON.stringify(initial);
let snapshot = serverSnapshot;
let readSource: () => ReminderSource = () => ({ scope: "unreadable-session", raw: "null", blocked: true });
const listeners = new Set<() => void>();
export function nativeReminderSupported() { return Capacitor.getPlatform() === "ios" && Capacitor.isPluginAvailable("LocalNotifications"); }
function publish(state: ReminderState) {
  snapshot = JSON.stringify({ ...state, native: Capacitor.getPlatform() === "ios", available: nativeReminderSupported() });
  listeners.forEach(notify => notify());
}
export const subscribeNativeReminders = (notify: () => void) => { listeners.add(notify); return () => { listeners.delete(notify); }; };
export const getNativeReminderSnapshot = () => snapshot;
export const getServerReminderSnapshot = () => serverSnapshot;
const controller = createNativeReminderController({
  checkPermissions: () => LocalNotifications.checkPermissions(),
  requestPermissions: () => LocalNotifications.requestPermissions(),
  getPending: () => LocalNotifications.getPending(),
  getDeliveredNotifications: () => LocalNotifications.getDeliveredNotifications(),
  cancel: options => LocalNotifications.cancel(options),
  removeDeliveredNotifications: options => LocalNotifications.removeDeliveredNotificationsById({ ids: options.notifications.map(item => item.id) }),
  schedule: options => LocalNotifications.schedule(options),
  readBinding: async () => {
    const { value } = await Preferences.get({ key: BINDING_KEY });
    if (value === null) return null;
    const parsed: ReminderBinding = JSON.parse(value);
    if (!parsed || typeof parsed.scope !== "string" || typeof parsed.enabled !== "boolean") throw Error("알림 설정을 읽지 못했어요. 이 기기 알림을 껐다가 다시 켜주세요.");
    return parsed;
  },
  writeBinding: async binding => { await Preferences.set({ key: BINDING_KEY, value: JSON.stringify(binding) }); },
}, () => readSource(), publish);
export async function refreshNativeReminders() { if (nativeReminderSupported()) await controller.refresh(); }
export async function enableNativeReminders() { if (!nativeReminderSupported()) throw Error("알림 기능이 포함된 최신 iPhone 앱을 설치해주세요."); await controller.enable(); }
export async function disableNativeReminders() { if (nativeReminderSupported()) await controller.disable(); }

export function startNativeReminders(read: () => ReminderSource, subscribe: (notify: () => void) => () => void) {
  publish(EMPTY_REMINDER_STATE);
  if (!nativeReminderSupported()) return () => {};
  readSource = read;
  let active = true;
  const update = () => { if (active) void refreshNativeReminders().catch(() => {}); };
  const unsubscribe = subscribe(update);
  const timer = window.setInterval(update, 60000);
  window.addEventListener("focus", update);
  document.addEventListener("visibilitychange", update);
  const handles: Array<{ remove(): Promise<void> }> = [];
  const listen = async (promise: Promise<{ remove(): Promise<void> }>) => {
    const handle = await promise; if (active) handles.push(handle); else await handle.remove();
  };
  void listen(LocalNotifications.addListener("localNotificationReceived", update)).catch(() => {});
  void listen(LocalNotifications.addListener("localNotificationActionPerformed", event => {
    if (!active) return;
    try {
      const extra = reminderExtra(event.notification), source = read();
      if (!extra || extra.scope !== source.scope) return;
      const item = nativeReminderPlan(source, Date.now()).all.find(item => item.extra.signature === extra.signature);
      if (!item) return;
      const url = new URL(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/todo/`, window.location.origin);
      url.searchParams.set("reminder-date", item.extra.date);
      window.location.assign(url.href);
    } catch { update(); }
  })).catch(() => {});
  update();
  return () => {
    active = false; controller.invalidate(); unsubscribe(); window.clearInterval(timer);
    window.removeEventListener("focus", update); document.removeEventListener("visibilitychange", update);
    for (const handle of handles) void handle.remove();
  };
}
