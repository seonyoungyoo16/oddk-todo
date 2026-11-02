import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { koreanToday } from "./plan-date.ts";

/** A native timetable follows Seoul's day without changing the user's selected workspace date. */
export const getNativeTimetableDate = () => Capacitor.isNativePlatform() ? koreanToday() : "";
export const getServerNativeTimetableDate = () => "";

export function subscribeNativeTimetableDate(notify: () => void) {
  if (!Capacitor.isNativePlatform()) return () => {};
  let disposed = false;
  let timer: ReturnType<typeof setTimeout>;
  let removeAppListener: (() => Promise<void>) | undefined;
  const schedule = () => {
    clearTimeout(timer);
    const nextMidnight = Date.parse(`${koreanToday()}T00:00:00+09:00`) + 86400000;
    timer = setTimeout(refresh, Math.max(1, Math.min(60000, nextMidnight - Date.now() + 20)));
  };
  const refresh = () => { if (!disposed) { notify(); schedule(); } };
  window.addEventListener("focus", refresh);
  document.addEventListener("visibilitychange", refresh);
  void App.addListener("appStateChange", state => { if (state.isActive) refresh(); }).then(listener => {
    if (disposed) void listener.remove();
    else removeAppListener = () => listener.remove();
  }).catch(() => { /* Visibility/focus and the clock still cover the current view. */ });
  schedule();
  return () => {
    disposed = true;
    clearTimeout(timer);
    window.removeEventListener("focus", refresh);
    document.removeEventListener("visibilitychange", refresh);
    void removeAppListener?.();
  };
}
