import { applyExecutionCommand, ExecutionCommandError } from "../../supabase/functions/_shared/execution-command.ts";
import type { ExecutionCommandRequest } from "../../supabase/functions/_shared/execution-command.ts";
import { executionTotals, expireExecution, isExecutionTime, transitionExecution, validExecutionRecord } from "../../supabase/functions/_shared/execution.ts";
import type { ExecutionRecord } from "../../supabase/functions/_shared/execution.ts";
import type { Plan } from "../../supabase/functions/_shared/plan.ts";
import { isPlanDate } from "../../supabase/functions/_shared/calendar.ts";
import { sameValue } from "./json-equality.ts";

export type LocalExecutionData = { revision: number; records: ExecutionRecord[]; operations: { id: string; fingerprint: string }[] };
export const emptyExecutionData = (): LocalExecutionData => ({ revision: 0, records: [], operations: [] });
export function validLocalExecutionData(value: unknown): value is LocalExecutionData {
  if (!value || typeof value !== "object") return false;
  const v = value as LocalExecutionData;
  return Object.keys(v).length === 3 && Number.isSafeInteger(v.revision) && v.revision >= 0 && v.revision < Number.MAX_SAFE_INTEGER && Array.isArray(v.records) && v.records.every(validExecutionRecord)
    && new Set(v.records.map(r => r.id)).size === v.records.length && v.records.filter(r => r.endedAt === null).length <= 1
    && Array.isArray(v.operations) && v.operations.every(o => o && Object.keys(o).length === 2 && typeof o.id === "string" && typeof o.fingerprint === "string" && o.fingerprint.length <= 32768)
    && new Set(v.operations.map(o => o.id)).size === v.operations.length;
}
const end = (r: ExecutionRecord, index: number) => Date.parse(r.segments[index].end ?? new Date(Math.min(Date.parse("9999-12-31T23:59:59.999Z"), Date.parse(r.startedAt) + 86400000)).toISOString());
export function executionOverlaps(a: ExecutionRecord, b: ExecutionRecord) {
  if (Date.parse(a.startedAt) >= Date.parse(b.endedAt ?? new Date(Math.min(Date.parse("9999-12-31T23:59:59.999Z"), Date.parse(b.startedAt) + 86400000)).toISOString()) || Date.parse(b.startedAt) >= Date.parse(a.endedAt ?? new Date(Math.min(Date.parse("9999-12-31T23:59:59.999Z"), Date.parse(a.startedAt) + 86400000)).toISOString())) return false;
  return a.segments.some((s, i) => b.segments.some((t, j) => Date.parse(s.start) < end(b, j) && Date.parse(t.start) < end(a, i) && end(a, i) > Date.parse(s.start) && end(b, j) > Date.parse(t.start)));
}
export function reconcileLocalExecution(value: LocalExecutionData, plan: Plan, now: string): LocalExecutionData {
  if (!validLocalExecutionData(value) || !isExecutionTime(now)) throw new Error("저장된 시간 기록을 확인해야 해요. 원본은 유지했어요.");
  const current = value.records.find(r => r.endedAt === null); if (!current) return value;
  let next = expireExecution(current, now);
  const task = plan.tasks.find(t => t.id === current.taskId);
  if (next === current && (!task || task.done || task.summaryOnly)) next = transitionExecution(current, "stop", now, task ? "completed" : "removed");
  return next === current ? value : { ...value, revision: value.revision + 1, records: value.records.map(r => r.id === next.id ? next : r) };
}
export function applyLocalExecution(value: LocalExecutionData, plan: Plan, request: ExecutionCommandRequest, now: string): LocalExecutionData {
  const latest = reconcileLocalExecution(value, plan, now), fingerprint = JSON.stringify(request), applied = latest.operations.find(o => o.id === request.operationId);
  if (applied) {
    if (applied.fingerprint !== fingerprint) throw new ExecutionCommandError("stale", "이미 사용한 기록 요청이에요. 현재 상태를 다시 확인해주세요.");
    return latest;
  }
  const c = request.command, targetId = "recordId" in c ? c.recordId : request.operationId;
  const change = applyExecutionCommand(request, { plan, revision: latest.revision, current: latest.records.find(r => r.endedAt === null) ?? null, target: latest.records.find(r => r.id === targetId) ?? null, now });
  const records = latest.records.filter(r => !change.records.some(next => next.id === r.id)).concat(change.records);
  for (const record of change.records) if (records.some(other => other.id !== record.id && executionOverlaps(record, other))) throw new Error("이미 기록된 작업·휴식 시간과 겹쳐요. 구간을 확인해주세요.");
  const changed = change.records.some(r => !sameValue(r, latest.records.find(old => old.id === r.id)));
  return { revision: latest.revision + (changed ? 1 : 0), records, operations: [...latest.operations, { id: request.operationId, fingerprint }] };
}
export function localExecutionHistory(value: LocalExecutionData, from: string, to: string, now: string) {
  if (!validLocalExecutionData(value) || !isPlanDate(from) || !isPlanDate(to) || to < from || !isExecutionTime(now)) throw new Error("기록 기간을 확인해주세요.");
  const first = Date.parse(`${from}T00:00:00+09:00`), until = Date.parse(`${to}T00:00:00+09:00`) + 86400000;
  const records = value.records.filter(r => Date.parse(r.startedAt) < until && Date.parse(r.endedAt ?? new Date(Math.min(Date.parse(r.startedAt) + 86400000, Date.parse(now))).toISOString()) >= first).sort((a, b) => b.startedAt.localeCompare(a.startedAt) || b.id.localeCompare(a.id));
  let workMs = 0, breakMs = 0;
  for (let day = first; day < until; day += 86400000) {
    const date = new Date(day + 32400000).toISOString().slice(0, 10);
    for (const r of records) { const totals = executionTotals(r, now, date); workMs += totals.workMs; breakMs += totals.breakMs; }
  }
  return { records, totals: { workMs, breakMs }, now };
}
export type ExecutionBackup = { type: "oddk-executions"; schemaVersion: 1; exportedAt: string; records: ExecutionRecord[] };
export function parseExecutionBackup(text: string): ExecutionBackup {
  if (text.length > 10 * 1024 * 1024) throw new Error("실적 백업은10MB까지 읽을 수 있어요.");
  let v;
  try { v = JSON.parse(text); } catch { throw new Error("실적 백업 JSON을 읽지 못했어요. 원본 파일과 기존 기록은 유지했어요."); }
  if (!v || Object.keys(v).length !== 4 || v.type !== "oddk-executions" || v.schemaVersion !== 1 || !isExecutionTime(v.exportedAt) || !Array.isArray(v.records) || v.records.length > 10000 || !v.records.every(validExecutionRecord) || new Set(v.records.map((r: ExecutionRecord) => r.id)).size !== v.records.length) throw new Error("실적 백업 형식을 확인해주세요. 기존 기록은 유지했어요.");
  return v;
}
export function importLocalExecutions(value: LocalExecutionData, records: ExecutionRecord[], now: string): LocalExecutionData {
  if (!validLocalExecutionData(value) || !isExecutionTime(now) || !records.every(r => validExecutionRecord(r) && r.endedAt !== null && r.endedAt <= now) || new Set(records.map(r => r.id)).size !== records.length) throw new Error("종료한 과거 기록만 가져올 수 있어요.");
  const merged = [...value.records];
  for (const record of records) {
    const previous = merged.find(r => r.id === record.id);
    if (previous) { if (!sameValue(previous, record)) throw new Error("같은 ID의 기록 내용이 달라요. 기존 기록은 유지했어요."); continue; }
    if (merged.some(other => executionOverlaps(record, other))) throw new Error("가져올 기록과 기존 시간이 겹쳐요. 기존 기록은 유지했어요.");
    merged.push(record);
  }
  return merged.length === value.records.length ? value : { ...value, revision: value.revision + 1, records: merged };
}
