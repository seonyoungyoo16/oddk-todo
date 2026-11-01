import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { LiveUpdate } from "@capawesome/capacitor-live-update";
import config from "../../mobile-updates.config.json";
import { stageNativeUpdate, verifyUpdateManifest } from "./native-update-policy";

let markReady: () => void;
const ready = new Promise<void>(resolve => { markReady = resolve; });
export function markNativeUpdateReady() { markReady(); }

export function startNativeUpdates() {
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable("LiveUpdate")) return () => {};
  let stopped = false, checking = false, lastCheck = 0;
  let removeListener: (() => void) | undefined;
  const check = async () => {
    if (stopped || checking || Date.now() - lastCheck < 5 * 60_000) return;
    checking = true;
    lastCheck = Date.now();
    try {
      const response = await fetch(`${config.manifestUrl}?t=${Date.now()}`, { cache: "no-store", credentials: "omit", signal: AbortSignal.timeout(10000) });
      if (!response.ok) return;
      const release = await verifyUpdateManifest(await response.json(), config, process.env.NEXT_PUBLIC_MOBILE_RUNTIME ?? "");
      if (stopped) return;
      // Stage only: editing, login and pending task operations continue uninterrupted.
      // The native loader applies the verified bundle on the next cold launch.
      await stageNativeUpdate(LiveUpdate, release, process.env.NEXT_PUBLIC_MOBILE_COMMIT ?? "");
    } catch { /* Offline or invalid releases keep the working local bundle. */ }
    finally { checking = false; }
  };
  void ready.then(async () => {
    if (stopped) return;
    const status = await LiveUpdate.ready();
    document.documentElement.dataset.mobileBundle = status.currentBundleId ?? "embedded";
    document.documentElement.dataset.mobileCommit = process.env.NEXT_PUBLIC_MOBILE_COMMIT ?? "";
    if (stopped) return;
    const listener = await App.addListener("appStateChange", ({ isActive }) => { if (isActive) void check(); });
    if (stopped) { await listener.remove(); return; }
    removeListener = () => { void listener.remove(); };
    await check();
  }).catch(() => {});
  return () => { stopped = true; removeListener?.(); };
}
