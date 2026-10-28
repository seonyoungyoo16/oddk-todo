// Actual work/rest is independent of planned task time and plan schema versions.
import { isPlanDate } from "./calendar.ts";
import type { Task } from "./plan.ts";

export type ExecutionKind = "work" | "break";
export type ExecutionSegment = { kind: ExecutionKind; start: string; end: string | null };
export type ExecutionReason = "user" | "completed" | "removed" | "limit" | "manual";
export type ExecutionRecord = {
  schemaVersion: 1; id: string; taskId: string; title: string; plannedDate: string | null;
  plannedWorkMinutes: number | null; plannedTotalMinutes: number | null;
  startedAt: string; endedAt: string | null; finishReason: ExecutionReason | null;
  needsReview: boolean; segments: ExecutionSegment[];
};
type ExecutionTask = Pick<Task, "id" | "title" | "plannedDate" | "minutes" | "bufferMinutes" | "done"> & { summaryOnly?: boolean };
const MAX_SPAN = 24 * 60 * 60 * 1000;
const LAST_TIME = Date.parse("9999-12-31T23:59:59.999Z");
const reasons = ["user", "completed", "removed", "limit", "manual"];
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const uuid = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
export function isExecutionTime(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) && !v.startsWith("0000-") && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
}
const windowEnd = (start: string) => Math.min(LAST_TIME, Date.parse(start) + MAX_SPAN);
function validSnapshot(v: Record<string, unknown>) {
  if (typeof v.taskId !== "string" || !v.taskId || v.taskId.length > 1000 || typeof v.title !== "string" || !v.title.trim() || v.title.length > 120 || !(v.plannedDate === null || isPlanDate(v.plannedDate))) return false;
  if (v.plannedWorkMinutes === null && v.plannedTotalMinutes === null) return true;
  return Number.isInteger(v.plannedTotalMinutes) && (v.plannedTotalMinutes as number) >= 2 && (v.plannedTotalMinutes as number) <= 240 && Number.isInteger(v.plannedWorkMinutes) && (v.plannedWorkMinutes as number) >= 1 && (v.plannedWorkMinutes as number) < (v.plannedTotalMinutes as number);
}
export function validExecutionRecord(v: unknown): v is ExecutionRecord {
  if (!record(v) || Object.keys(v).length !== 12 || v.schemaVersion !== 1 || !uuid(v.id) || !validSnapshot(v) || !isExecutionTime(v.startedAt) || !(v.endedAt === null || isExecutionTime(v.endedAt)) || typeof v.needsReview !== "boolean" || !Array.isArray(v.segments) || v.segments.length < 1 || v.segments.length > 64) return false;
  if (v.endedAt === null ? v.finishReason !== null || v.needsReview : !reasons.includes(v.finishReason as string) || (v.finishReason === "limit") !== v.needsReview) return false;
  const start = Date.parse(v.startedAt), limit = windowEnd(v.startedAt), end = v.endedAt === null ? limit : Date.parse(v.endedAt);
  if (end < start || end > limit || v.finishReason === "limit" && end !== limit) return false;
  let previous = start;
  for (let i = 0; i < v.segments.length; i++) {
    const s = v.segments[i];
    if (!record(s) || Object.keys(s).length !== 3 || !["work", "break"].includes(s.kind as string) || !isExecutionTime(s.start) || !(s.end === null || isExecutionTime(s.end))) return false;
    const from = Date.parse(s.start), until = s.end === null ? limit : Date.parse(s.end);
    if (i === 0 && from !== start || from < previous || from > end || until < from || until > end || s.end === null && (i !== v.segments.length - 1 || v.endedAt !== null)) return false;
    previous = until;
  }
  return true;
}
export function executionPhase(value: ExecutionRecord): "work" | "break" | "paused" | "stopped" {
  return value.endedAt !== null ? "stopped" : value.segments.at(-1)!.end === null ? value.segments.at(-1)!.kind : "paused";
}
function requireRecord(value: unknown): asserts value is ExecutionRecord {
  if (!validExecutionRecord(value)) throw new Error("시간 기록 형식을 확인해주세요. 기존 기록은 유지했어요.");
}
function snapshot(task: ExecutionTask, manual = false) {
  if (!task || typeof task.done !== "boolean" || task.summaryOnly || !manual && task.done) throw new Error("미완료 실행 업무에서 작업을 시작해주세요.");
  const unset = task.minutes === null && task.bufferMinutes === null;
  if (!unset && !(Number.isInteger(task.minutes) && Number.isInteger(task.bufferMinutes) && task.minutes! >= 2 && task.minutes! <= 240 && task.bufferMinutes! >= 1 && task.bufferMinutes! < task.minutes!)) throw new Error("계획 시간을 확인해주세요.");
  const value = { taskId: task.id, title: task.title, plannedDate: task.plannedDate, plannedWorkMinutes: unset ? null : task.minutes! - task.bufferMinutes!, plannedTotalMinutes: task.minutes };
  if (!validSnapshot(value)) throw new Error("할 일 정보를 확인해주세요.");
  return value;
}
export function startExecution(task: ExecutionTask, id: string, now: string): ExecutionRecord {
  const result: ExecutionRecord = { schemaVersion: 1, id, ...snapshot(task), startedAt: now, endedAt: null, finishReason: null, needsReview: false, segments: [{ kind: "work", start: now, end: null }] };
  requireRecord(result); return result;
}
export function expireExecution(value: ExecutionRecord, now: string): ExecutionRecord {
  requireRecord(value); if (!isExecutionTime(now)) throw new Error("현재 시각을 확인해주세요.");
  const limit = windowEnd(value.startedAt);
  if (value.endedAt !== null || Date.parse(now) < limit) return value;
  const end = new Date(limit).toISOString();
  return { ...value, endedAt: end, finishReason: "limit", needsReview: true, segments: value.segments.map(s => s.end === null ? { ...s, end } : { ...s }) };
}
export function transitionExecution(value: ExecutionRecord, action: "pause" | "resume" | "break" | "stop", now: string, reason: Exclude<ExecutionReason, "limit" | "manual"> = "user"): ExecutionRecord {
  requireRecord(value); if (!isExecutionTime(now)) throw new Error("현재 시각을 확인해주세요.");
  if (!["pause", "resume", "break", "stop"].includes(action) || !["user", "completed", "removed"].includes(reason)) throw new Error("기록 동작을 확인해주세요.");
  if (value.endedAt !== null) { if (action === "stop") return value; throw new Error("종료한 기록이에요. 새 기록을 시작해주세요."); }
  const last = value.segments.at(-1)!;
  if (Date.parse(now) < Date.parse(last.end ?? last.start)) throw new Error("기기 시각이 이전 기록보다 빨라요. 시각을 확인한 뒤 다시 시도해주세요.");
  const expired = expireExecution(value, now); if (expired !== value) return expired;
  const phase = executionPhase(value);
  if (action === "pause" && phase === "paused" || action === "resume" && phase === "work" || action === "break" && phase === "break") return value;
  const segments = value.segments.map(s => s.end === null ? { ...s, end: now } : { ...s });
  if (action === "resume" || action === "break") {
    if (segments.length >= 64) throw new Error("한 기록의 구간은64개까지예요. 기록을 종료한 뒤 새로 시작해주세요.");
    segments.push({ kind: action === "break" ? "break" : "work", start: now, end: null });
  }
  const result = { ...value, segments, ...(action === "stop" ? { endedAt: now, finishReason: reason } : {}) };
  requireRecord(result); return result;
}
export function correctExecution(value: ExecutionRecord, segments: ExecutionSegment[], now: string): ExecutionRecord {
  requireRecord(value); if (value.endedAt === null) throw new Error("진행 중인 기록을 먼저 종료해주세요.");
  if (!isExecutionTime(now) || !Array.isArray(segments) || !segments.length || segments.some(s => !record(s) || s.end === null || !isExecutionTime(s.end) || Date.parse(s.end) > Date.parse(now))) throw new Error("완료한 실제 시간 구간을 입력해주세요.");
  const result: ExecutionRecord = { ...value, startedAt: segments[0].start, endedAt: segments.at(-1)!.end, finishReason: "manual", needsReview: false, segments: segments.map(s => ({ ...s })) };
  requireRecord(result); return result;
}
export function manualExecution(task: ExecutionTask, id: string, segments: ExecutionSegment[], now: string): ExecutionRecord {
  // A closed empty-time seed preserves the same snapshot and validator used by
  // live records; correction supplies the explicitly entered actual intervals.
  const seed: ExecutionRecord = { schemaVersion: 1, id, ...snapshot(task, true), startedAt: now, endedAt: now, finishReason: "manual", needsReview: false, segments: [{ kind: "work", start: now, end: now }] };
  requireRecord(seed); return correctExecution(seed, segments, now);
}
export function executionTotals(value: ExecutionRecord, now: string, date?: string): { workMs: number; breakMs: number; clockIssue: boolean } {
  requireRecord(value); if (!isExecutionTime(now) || date !== undefined && !isPlanDate(date)) throw new Error("집계 날짜와 현재 시각을 확인해주세요.");
  const dayStart = date ? Date.parse(`${date}T00:00:00+09:00`) : -Infinity, dayEnd = date ? dayStart + 86400000 : Infinity;
  let workMs = 0, breakMs = 0, clockIssue = false;
  for (const s of value.segments) {
    const start = Date.parse(s.start), rawEnd = s.end === null ? Math.min(Date.parse(now), windowEnd(value.startedAt)) : Date.parse(s.end);
    if (rawEnd < start) clockIssue = true;
    const duration = Math.max(0, Math.min(Math.max(start, rawEnd), dayEnd) - Math.max(start, dayStart));
    if (s.kind === "work") workMs += duration; else breakMs += duration;
  }
  return { workMs, breakMs, clockIssue };
}
