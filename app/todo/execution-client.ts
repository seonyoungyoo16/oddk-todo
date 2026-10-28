import { syncClient } from "./supabase-client";
import { getPlanScope, getPlanSnapshot } from "./sync-store";
import { loadPlan } from "../../supabase/functions/_shared/plan-migration";
import { isExecutionTime, validExecutionRecord } from "../../supabase/functions/_shared/execution";
import type { ExecutionRecord } from "../../supabase/functions/_shared/execution";
import type { ExecutionRequest } from "../../supabase/functions/_shared/execution-command";

export type ExecutionState = { revision: number; current: ExecutionRecord | null; now: string };
export type ExecutionHistory = { records: ExecutionRecord[]; totals: { workMs: number; breakMs: number }; now: string; cursor: { startedAt: string; id: string } | null };
export function currentExecutionPlan(expected: string) {
  if (getPlanScope() !== expected) throw new Error("계정이 바뀌었어요. 현재 화면에서 다시 확인해주세요.");
  const loaded = loadPlan(getPlanSnapshot(""));
  if (!loaded.ok) throw new Error("현재 할 일을 읽지 못했어요. 시간 기록은 유지했어요.");
  return loaded.plan;
}
export async function checkExecutionScope(expected: string) {
  const { data, error } = await syncClient().auth.getSession();
  if (error || (data.session?.user.id ?? "local") !== expected || getPlanScope() !== expected) throw new Error("로그인 상태를 확인한 뒤 다시 시도해주세요.");
  return data.session;
}
export async function executionApi(scope: string, body: ExecutionRequest): Promise<ExecutionState | ExecutionHistory> {
  const session = await checkExecutionScope(scope);
  if (!session) throw new Error("로그인 상태를 다시 확인해주세요.");
  let response: Response, value;
  try {
    response = await fetch("https://synxmskamifpovuziecx.supabase.co/functions/v1/execution", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(body),
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000),
    });
    value = await response.json();
  } catch { throw new Error("서버 연결 또는 저장 결과를 확인하지 못했어요. 연결 후 같은 요청으로 결과를 다시 확인해주세요."); }
  await checkExecutionScope(scope);
  if (!response.ok) throw new Error(typeof value?.error === "string" ? value.error : "시간 기록을 확인하지 못했어요.");
  if (!value || !isExecutionTime(value.now)) throw new Error("시간 기록 응답을 확인해야 해요.");
  if (body.action === "history") {
    if (!Array.isArray(value.records) || value.records.length > body.limit || !value.records.every(validExecutionRecord) || !value.totals || ![value.totals.workMs, value.totals.breakMs].every(n => Number.isSafeInteger(n) && n >= 0) || !(value.cursor === null || isExecutionTime(value.cursor?.startedAt) && typeof value.cursor?.id === "string")) throw new Error("시간 기록 이력을 확인해야 해요.");
    return value as ExecutionHistory;
  }
  if (!Number.isSafeInteger(value.revision) || value.revision < 0 || value.current !== null && (!validExecutionRecord(value.current) || value.current.endedAt !== null)) throw new Error("현재 시간 기록을 확인해야 해요.");
  return value as ExecutionState;
}
export function downloadExecutionBackup(records: ExecutionRecord[]) {
  const text = JSON.stringify({ type: "oddk-executions", schemaVersion: 1, exportedAt: new Date().toISOString(), records }, null, 2);
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" })), a = document.createElement("a");
  a.href = url; a.download = `oddk-actual-time-${new Date().toISOString().slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
