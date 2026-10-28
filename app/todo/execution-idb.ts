import { applyLocalExecution, emptyExecutionData, importLocalExecutions, reconcileLocalExecution, validLocalExecutionData } from "./execution-local-model";
import type { LocalExecutionData } from "./execution-local-model";
import type { ExecutionCommandRequest } from "../../supabase/functions/_shared/execution-command";
import type { Plan } from "../../supabase/functions/_shared/plan";
import type { ExecutionRecord } from "../../supabase/functions/_shared/execution";

// One readwrite transaction serializes all local tabs. Resolve only after commit;
// never treat request.onsuccess as a durable write.
export function localExecutionTransaction(change: (current: LocalExecutionData) => LocalExecutionData): Promise<LocalExecutionData> {
  return new Promise((resolve, reject) => {
    let result: LocalExecutionData, failure: unknown, blocked = false;
    const open = indexedDB.open("oddk.actual-time.v1", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("data");
    open.onerror = () => reject(new Error("시간 기록 저장소를 열지 못했어요. 브라우저 저장 설정을 확인해주세요."));
    open.onblocked = () => { blocked = true; reject(new Error("다른 탭의 시간 기록 창을 닫고 다시 시도해주세요.")); };
    open.onsuccess = () => {
      const db = open.result;
      if (blocked) { db.close(); return; }
      const tx = db.transaction("data", "readwrite"), store = tx.objectStore("data"), request = store.get("local");
      tx.oncomplete = () => { db.close(); resolve(result); };
      tx.onabort = () => { db.close(); reject(failure instanceof DOMException ? new Error("시간 기록을 저장하지 못했어요. 브라우저 저장 공간을 확인해주세요. 기존 기록은 유지했어요.") : failure ?? new Error("시간 기록을 저장하지 못했어요. 기존 기록은 유지했어요.")); };
      tx.onerror = () => { /* transaction abort reports the definitive result */ };
      request.onsuccess = () => {
        try {
          const current = request.result === undefined ? emptyExecutionData() : request.result;
          if (!validLocalExecutionData(current)) throw new Error("저장된 시간 기록을 읽지 못했어요. 원본은 유지했어요.");
          result = change(current);
          if (!validLocalExecutionData(result)) throw new Error("시간 기록 형식을 확인해주세요.");
          if (result !== current) store.put(result, "local");
        } catch (error) { failure = error; tx.abort(); }
      };
    };
  });
}
export async function withLocalExecutionLock<T>(run: () => Promise<T>, required = false): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks) return await navigator.locks.request("oddk-actual-plan", async () => await run());
  if (required) return Promise.reject(new Error("이 브라우저에서는 안전한 재조정을 지원하지 않아요. 최신 Chrome·Edge·Safari에서 다시 시도해주세요."));
  return run();
}
export const readLocalExecutions = (plan: () => Plan) => withLocalExecutionLock(() => localExecutionTransaction(current => current.records.some(r => r.endedAt === null) ? reconcileLocalExecution(current, plan(), new Date().toISOString()) : current));
export const commandLocalExecutions = (plan: () => Plan, request: ExecutionCommandRequest) => withLocalExecutionLock(() => localExecutionTransaction(current => applyLocalExecution(current, plan(), request, new Date().toISOString())));
export const restoreLocalExecutions = (records: ExecutionRecord[]) => withLocalExecutionLock(() => localExecutionTransaction(current => importLocalExecutions(current, records, new Date().toISOString())));
