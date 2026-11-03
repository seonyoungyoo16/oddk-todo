"use client";
import { useEffect, useState } from "react";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { createNativeAuthHandler } from "./native-options";
import { syncClient } from "./supabase-client";
import { startNativeUpdates } from "./native-updates";
import { startNativeReminders, refreshNativeReminders, getNativeReminderSnapshot, subscribeNativeReminders } from "./native-reminders";
import { startNativeExecutionRuntime } from "./native-execution-runtime";
import { useNativeReminderStatus } from "./native-reminder-settings";
import { installNativeTouchPolicy } from "./native-touch-policy";
import { getPlanScope, getPlanSnapshot, hasPendingAccountDeletion, subscribePlan, subscribeSync } from "./sync-store";

export function NativeRuntime() {
  useEffect(() => installNativeTouchPolicy(document.documentElement, Capacitor.isNativePlatform()), []);
  const [message, setMessage] = useState("");
  const reminders = useNativeReminderStatus();
  useEffect(() => startNativeExecutionRuntime({
    readGate: () => {
      try {
        const state = JSON.parse(getNativeReminderSnapshot());
        return { scope: getPlanScope(), enabled: state.enabled && state.permission === "granted" && state.phase === "ready", blocked: hasPendingAccountDeletion() };
      } catch { return { scope: "unreadable-session", enabled: false, blocked: true }; }
    },
    subscribeGate: notify => {
      const stops = [subscribeNativeReminders(notify), subscribePlan(notify), subscribeSync(notify)];
      return () => stops.forEach(stop => stop());
    },
    onReservationsChanged: () => { void refreshNativeReminders().catch(() => {}); },
    onError: setMessage,
  }), []);
  useEffect(() => startNativeReminders(() => {
    try { return { scope: getPlanScope(), raw: getPlanSnapshot(JSON.stringify({ schemaVersion: 5, start: "09:00", tasks: [], reviewsByDate: {}, goalTree: { goal: "", groups: [] } })), blocked: hasPendingAccountDeletion() }; }
    catch { return { scope: "unreadable-session", raw: "null", blocked: true }; }
  }, notify => {
    const stopPlan = subscribePlan(notify), stopSync = subscribeSync(notify);
    return () => { stopPlan(); stopSync(); };
  }), []);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const stopUpdates = startNativeUpdates();
    let active = true;
    const listeners: PluginListenerHandle[] = [];
    const report = () => { if (active) setMessage("로그인 연결을 완료하지 못했어요. 다시 로그인해주세요."); };
    const handle = createNativeAuthHandler(async (code, flowId) => {
      const { error } = await syncClient().auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
      if (error) throw error;
      if (active) setMessage("");
    });
    const receive = async (url: string) => {
      try { if (await handle(url)) await Browser.close().catch(() => {}); }
      catch { report(); }
    };
    const listen = async (promise: Promise<PluginListenerHandle>) => {
      const listener = await promise;
      if (active) listeners.push(listener); else await listener.remove();
    };
    void listen(App.addListener("appUrlOpen", ({ url }) => { void receive(url); })).then(async () => {
      const launch = await App.getLaunchUrl();
      if (active && launch?.url) await receive(launch.url);
    }).catch(report);
    void listen(App.addListener("appStateChange", ({ isActive }) => {
      if (isActive) { syncClient().auth.startAutoRefresh(); window.dispatchEvent(new Event("focus")); }
      else syncClient().auth.stopAutoRefresh();
    })).catch(report);
    if (Capacitor.getPlatform() === "android") void listen(App.addListener("backButton", ({ canGoBack }) => {
      const dialog = [...document.querySelectorAll<HTMLDialogElement>("dialog[open]")].at(-1);
      if (dialog) {
        const close = new Event("cancel", { cancelable: true });
        if (dialog.dispatchEvent(close)) dialog.close();
      } else if (canGoBack) window.history.back();
      else void App.minimizeApp();
    })).catch(report);
    return () => { active = false; stopUpdates(); for (const listener of listeners) void listener.remove(); };
  }, []);
  return <>{message && <div className="oddk-nativeMessage" role="alert">{message}<button type="button" onClick={() => setMessage("")}>닫기</button></div>}{reminders.error && <div className="oddk-nativeMessage" role="alert">{reminders.error}<button type="button" onClick={() => void refreshNativeReminders().catch(() => {})}>다시 확인</button></div>}</>;
}
