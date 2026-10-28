import { dateOrdinal, isPlanDate } from "./calendar.ts";
import { validPlan } from "./plan.ts";
import { sameValue } from "./json-equality.ts";
import type { Plan } from "./plan.ts";
import { correctExecution, isExecutionTime, manualExecution, startExecution, transitionExecution, validExecutionRecord } from "./execution.ts";
import type { ExecutionRecord, ExecutionSegment } from "./execution.ts";

type PhaseCommand = { type: "pause" | "resume" | "break" | "stop"; recordId: string };
export type ExecutionCommand = { type: "start"; taskId: string } | { type: "switch"; taskId: string; fromRecordId: string } | PhaseCommand |
  { type: "manual"; taskId: string; segments: ExecutionSegment[] } | { type: "correct"; recordId: string; segments: ExecutionSegment[] };
export type ExecutionCommandRequest = { action: "command"; operationId: string; revision: number; command: ExecutionCommand };
export type ExecutionRequest = { action: "status" } | { action: "history"; from: string; to: string; limit: number; cursor: { startedAt: string; id: string } | null } | ExecutionCommandRequest;
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const uuid = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
const taskId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 1000;
const revision = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v < Number.MAX_SAFE_INTEGER;
function segments(v: unknown): ExecutionSegment[] | null {
  if (!Array.isArray(v) || v.length < 1 || v.length > 64 || v.some(s => !record(s) || Object.keys(s).length !== 3 || !["work", "break"].includes(s.kind as string) || !isExecutionTime(s.start) || !isExecutionTime(s.end))) return null;
  return v.map(s => ({ kind: s.kind, start: s.start, end: s.end }));
}
export function parseExecutionRequest(v: unknown): ExecutionRequest | null {
  if (!record(v)) return null;
  if (v.action === "status") return Object.keys(v).length === 1 ? { action: "status" } : null;
  if (v.action === "history") {
    if (Object.keys(v).length !== 5 || !isPlanDate(v.from) || !isPlanDate(v.to) || dateOrdinal(v.to) < dateOrdinal(v.from) || dateOrdinal(v.to) - dateOrdinal(v.from) >= 366 || typeof v.limit !== "number" || !Number.isInteger(v.limit) || v.limit < 1 || v.limit > 100 || !(v.cursor === null || record(v.cursor) && Object.keys(v.cursor).length === 2 && isExecutionTime(v.cursor.startedAt) && uuid(v.cursor.id))) return null;
    return { action: "history", from: v.from, to: v.to, limit: v.limit, cursor: v.cursor === null ? null : { startedAt: v.cursor.startedAt as string, id: v.cursor.id as string } };
  }
  if (v.action !== "command" || Object.keys(v).length !== 4 || !uuid(v.operationId) || !revision(v.revision) || !record(v.command)) return null;
  const c = v.command; let command: ExecutionCommand;
  if (c.type === "start" && Object.keys(c).length === 2 && taskId(c.taskId)) command = { type: "start", taskId: c.taskId };
  else if (c.type === "switch" && Object.keys(c).length === 3 && taskId(c.taskId) && uuid(c.fromRecordId)) command = { type: "switch", taskId: c.taskId, fromRecordId: c.fromRecordId };
  else if (["pause", "resume", "break", "stop"].includes(c.type as string) && Object.keys(c).length === 2 && uuid(c.recordId)) command = { type: c.type as PhaseCommand["type"], recordId: c.recordId };
  else if (c.type === "manual" && Object.keys(c).length === 3 && taskId(c.taskId)) { const values = segments(c.segments); if (!values) return null; command = { type: "manual", taskId: c.taskId, segments: values }; }
  else if (c.type === "correct" && Object.keys(c).length === 3 && uuid(c.recordId)) { const values = segments(c.segments); if (!values) return null; command = { type: "correct", recordId: c.recordId, segments: values }; }
  else return null;
  // Returning a fresh fixed-key shape gives reordered JSON the same fingerprint.
  return { action: "command", operationId: v.operationId, revision: v.revision, command };
}
export class ExecutionCommandError extends Error {
  readonly code: "stale" | "active" | "missing" | "invalid" | "unavailable";
  constructor(code: ExecutionCommandError["code"], message: string) { super(message); this.code = code; }
}
export type ExecutionContext = { plan: Plan; current: ExecutionRecord | null; target: ExecutionRecord | null; revision: number; now: string };
export type ExecutionChange = { records: ExecutionRecord[]; activeId: string | null };
export function applyExecutionCommand(request: ExecutionCommandRequest, context: ExecutionContext): ExecutionChange {
  // The store supplies owner-filtered records and database time. SQL must still
  // compare plan/state versions and commit this whole delta in one transaction.
  if (!validPlan(context.plan) || !revision(context.revision) || !isExecutionTime(context.now) || context.current !== null && (!validExecutionRecord(context.current) || context.current.endedAt !== null) || context.target !== null && !validExecutionRecord(context.target)) throw new ExecutionCommandError("unavailable", "저장된 시간 기록을 확인해야 해요.");
  if (context.current && context.target?.id === context.current.id && !sameValue(context.current, context.target)) throw new ExecutionCommandError("unavailable", "기록 상태를 함께 확인하지 못했어요.");
  if (request.revision !== context.revision) throw new ExecutionCommandError("stale", "다른 기기에서 기록을 바꿨어요. 현재 상태를 확인해주세요.");
  const c = request.command, current = context.current, activeId = current?.id ?? null;
  if (["start", "switch", "manual"].includes(c.type) && (request.operationId === current?.id || request.operationId === context.target?.id)) throw new ExecutionCommandError("stale", "이미 저장된 기록 ID예요. 적용 상태를 다시 확인해주세요.");
  const selectedTask = (id: string) => {
    const task = context.plan.tasks.find(task => task.id === id);
    if (!task) throw new ExecutionCommandError("missing", "할 일이 삭제되거나 바뀌었어요. 목록을 다시 확인해주세요.");
    return task;
  };
  try {
    if (c.type === "start") {
      if (current) throw new ExecutionCommandError("active", "기록 중인 일이 있어요. 먼저 종료하거나 작업 전환을 확인해주세요.");
      return { records: [startExecution(selectedTask(c.taskId), request.operationId, context.now)], activeId: request.operationId };
    }
    if (c.type === "switch") {
      if (!current || current.id !== c.fromRecordId || current.id === request.operationId) throw new ExecutionCommandError("stale", "전환할 현재 기록이 바뀌었어요. 다시 확인해주세요.");
      return { records: [transitionExecution(current, "stop", context.now), startExecution(selectedTask(c.taskId), request.operationId, context.now)], activeId: request.operationId };
    }
    if (c.type === "manual") return { records: [manualExecution(selectedTask(c.taskId), request.operationId, c.segments, context.now)], activeId };
    if (c.type === "correct") {
      if (!context.target || context.target.id !== c.recordId) throw new ExecutionCommandError("missing", "시간 기록을 찾지 못했어요.");
      return { records: [correctExecution(context.target, c.segments, context.now)], activeId };
    }
    if (!current || current.id !== c.recordId) {
      if (c.type === "stop" && context.target?.id === c.recordId && context.target.endedAt !== null) return { records: [], activeId };
      throw new ExecutionCommandError("stale", "현재 기록이 바뀌었어요. 상태를 다시 확인해주세요.");
    }
    const next = transitionExecution(current, c.type, context.now);
    return { records: next === current ? [] : [next], activeId: next.endedAt === null ? next.id : null };
  } catch (error) {
    if (error instanceof ExecutionCommandError) throw error;
    throw new ExecutionCommandError("invalid", error instanceof Error ? error.message : "실제 시간 입력을 확인해주세요.");
  }
}
