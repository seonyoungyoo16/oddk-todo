"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ExecutionCommand, ExecutionCommandRequest } from "../../supabase/functions/_shared/execution-command";
import type { ExecutionRecord } from "../../supabase/functions/_shared/execution";
import { isPlanDate } from "../../supabase/functions/_shared/plan";
import { commandLocalExecutions, readLocalExecutions, restoreLocalExecutions } from "./execution-idb";
import { localExecutionHistory } from "./execution-local-model";
import { checkExecutionScope, currentExecutionPlan, executionApi } from "./execution-client";
import type { ExecutionState, ExecutionHistory } from "./execution-client";

export function useExecution(scope: string, date: string, planSnapshot: string, enabled: boolean) {
  const [state, setState] = useState<ExecutionState | null>(null), [history, setHistory] = useState<ExecutionHistory | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [pending, setPending] = useState<ExecutionCommandRequest | null>(null);
  const alive = useRef(false), inFlight = useRef(false), generation = useRef(0), pollingHeld = useRef(false);
  const suspendPolling = useCallback((value: boolean) => { pollingHeld.current = value; if (value) generation.current++; }, []);
  useEffect(() => { const epoch = generation; alive.current = true; return () => { alive.current = false; epoch.current++; }; }, []);
  const refresh = useCallback(async (cursor: ExecutionHistory["cursor"] = null) => {
    if (!enabled || !isPlanDate(date)) return;
    const turn = ++generation.current;
    await checkExecutionScope(scope);
    let next: ExecutionState, records: ExecutionHistory;
    if (scope === "local") {
      const data = await readLocalExecutions(() => currentExecutionPlan(scope)), now = new Date().toISOString();
      next = { revision: data.revision, current: data.records.find(r => r.endedAt === null) ?? null, now };
      records = { ...localExecutionHistory(data, date, date, now), cursor: null };
    } else {
      next = await executionApi(scope, { action: "status" }) as ExecutionState;
      records = await executionApi(scope, { action: "history", from: date, to: date, limit: 50, cursor }) as ExecutionHistory;
    }
    await checkExecutionScope(scope);
    if (!alive.current || turn !== generation.current) return;
    setState(next); setHistory(previous => cursor && previous ? { ...records, records: [...previous.records, ...records.records.filter(r => !previous.records.some(p => p.id === r.id))] } : records);
  }, [scope, date, enabled]);
  useEffect(() => {
    const epoch = generation;
    const reload = () => { if (!inFlight.current && !pollingHeld.current) void refresh().catch(e => { if (alive.current) setError(e instanceof Error ? e.message : "시간 기록을 확인하지 못했어요."); }); };
    reload(); const timer = setInterval(reload, 15000);
    window.addEventListener("focus", reload); window.addEventListener("online", reload);
    return () => { clearInterval(timer); window.removeEventListener("focus", reload); window.removeEventListener("online", reload); epoch.current++; };
  }, [refresh, planSnapshot]);
  async function runRequest(request: ExecutionCommandRequest) {
    if (!enabled || inFlight.current) return false;
    inFlight.current = true; setBusy(true); setError(""); setMessage(""); setPending(request); generation.current++;
    try {
      await checkExecutionScope(scope);
      let result: ExecutionState;
      if (scope === "local") {
        const data = await commandLocalExecutions(() => currentExecutionPlan(scope), request);
        result = { revision: data.revision, current: data.records.find(r => r.endedAt === null) ?? null, now: new Date().toISOString() };
      } else result = await executionApi(scope, request) as ExecutionState;
      await checkExecutionScope(scope);
      if (!alive.current) return false;
      setState(result); setPending(null); setMessage(request.command.type === "stop" ? "수행 기록을 저장했어요." : "시간 기록을 저장했어요.");
      try { await refresh(); } catch { setError("조작은 저장했지만 이력을 갱신하지 못했어요. 다시 확인해주세요."); }
      return true;
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : "저장 결과를 확인하지 못했어요. 같은 요청으로 다시 확인해주세요.");
      try { await refresh(); } catch { /* preserve last confirmed state and pending request */ }
      return false;
    } finally { inFlight.current = false; if (alive.current) setBusy(false); }
  }
  async function command(value: ExecutionCommand, expectedRevision = state?.revision) {
    if (!state || pending) { setError("이전 요청의 저장 결과를 먼저 확인해주세요."); return false; }
    return runRequest({ action: "command", operationId: crypto.randomUUID(), revision: expectedRevision ?? state.revision, command: value });
  }
  async function restore(records: ExecutionRecord[]) {
    if (scope !== "local" || inFlight.current) return false;
    inFlight.current = true; setBusy(true); setError(""); setMessage("");
    try {
      await checkExecutionScope(scope); await restoreLocalExecutions(records); await checkExecutionScope(scope); await refresh();
      if (alive.current) setMessage("종료한 기록을 가져왔어요. 기존 기록은 보존했어요."); return true;
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : "기록을 가져오지 못했어요."); return false; }
    finally { inFlight.current = false; if (alive.current) setBusy(false); }
  }
  async function importRecord(record: ExecutionRecord, taskId: string) {
    if (!state || pending || record.endedAt === null) return false;
    return runRequest({ action: "command", operationId: record.id, revision: state.revision, command: { type: "manual", taskId, segments: record.segments } });
  }
  return { state, history, busy, error, message, pending, command, restore, importRecord, refresh, suspendPolling, retry: () => pending ? runRequest(pending) : refresh(),
    clearPending: () => { setPending(null); setError(""); setMessage("다시 불러온 현재 상태를 확인한 뒤 새로 조작해주세요."); },
  };
}
export type ExecutionController = ReturnType<typeof useExecution>;
