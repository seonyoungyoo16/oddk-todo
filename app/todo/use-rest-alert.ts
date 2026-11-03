"use client";
import { useEffect, useSyncExternalStore } from "react";
import type { ExecutionRecord } from "../../supabase/functions/_shared/execution";
import { matchedRestAlert, parseRestAlert } from "./rest-alert";
import { restAlertStore, REST_ALERT_KEY } from "./rest-alert-store";

export function useRestAlert(scope: string, record: ExecutionRecord | null, confirmed = false) {
  const raw = useSyncExternalStore(restAlertStore.subscribe, restAlertStore.getSnapshot, () => "");
  useEffect(() => {
    const changed = (event: StorageEvent) => { if (event.key === REST_ALERT_KEY || event.key === null) restAlertStore.notify(); };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, []);
  useEffect(() => {
    // Identity validation already excludes stale values even if storage is unavailable.
    try { restAlertStore.reconcile(scope, record, confirmed); } catch { /* retry on the next confirmed state */ }
  }, [scope, record, confirmed]);
  return matchedRestAlert(scope, record, parseRestAlert(raw));
}
