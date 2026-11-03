import { bindRestAlert, matchedRestAlert, parseRestAlert } from "./rest-alert.ts";
import type { ExecutionRecord } from "../../supabase/functions/_shared/execution.ts";

export const REST_ALERT_KEY = "oddk.rest-alert.v1";
export function createRestAlertStore(storage: () => Pick<Storage, "getItem" | "setItem" | "removeItem">) {
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach(fn => fn());
  const getSnapshot = () => { try { return storage().getItem(REST_ALERT_KEY) ?? ""; } catch { return ""; } };
  const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
  const save = (scope: string, record: ExecutionRecord, minutes: number) => {
    const value = bindRestAlert(scope, record, minutes);
    try { storage().setItem(REST_ALERT_KEY, JSON.stringify(value)); }
    catch { throw Error("휴식 알림 기준을 저장하지 못했어요. 현재 설정을 확인하고 다시 시도해주세요."); }
    notify(); return value;
  };
  const reconcile = (scope: string, record: ExecutionRecord | null, confirmed: boolean) => {
    const raw = getSnapshot(), binding = parseRestAlert(raw);
    if (!raw || binding?.scope === scope && (!confirmed || matchedRestAlert(scope, record, binding))) return;
    storage().removeItem(REST_ALERT_KEY); notify();
  };
  return { getSnapshot, subscribe, save, reconcile, notify };
}
export const restAlertStore = createRestAlertStore(() => window.localStorage);
