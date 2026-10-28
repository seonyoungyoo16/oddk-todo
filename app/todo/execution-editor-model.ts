import { correctExecution, isExecutionTime, manualExecution, validExecutionRecord } from "../../supabase/functions/_shared/execution.ts";
import type { ExecutionRecord, ExecutionSegment } from "../../supabase/functions/_shared/execution.ts";
import type { Task } from "../../supabase/functions/_shared/plan.ts";
export type ExecutionRowDraft = { kind: "work" | "break"; start: string; end: string };
export type ExecutionEditorDraft = { expected: ExecutionRecord | null; taskId: string; rows: ExecutionRowDraft[] };
export function koreanExecutionInput(iso: string) { return new Date(Date.parse(iso) + 32400000).toISOString().slice(0, -1); }
export function executionInputTime(value: string): string {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?$/.test(value)) throw new Error("시작·종료 날짜와 시각을 모두 입력해주세요.");
  const instant = Date.parse(value + "+09:00");
  if (!Number.isFinite(instant)) throw new Error("실제 날짜와 시각을 확인해주세요.");
  const iso = new Date(instant).toISOString(), normalized = value.length === 16 ? value + ":00.000" : value.length === 19 ? value + ".000" : value.padEnd(23, "0");
  if (!isExecutionTime(iso) || koreanExecutionInput(iso) !== normalized) throw new Error("존재하는 날짜와 시각을 입력해주세요.");
  return iso;
}
export function initialExecutionEditor(record: ExecutionRecord | null, taskId = ""): ExecutionEditorDraft {
  return { expected: record, taskId: record?.taskId ?? taskId, rows: record ? record.segments.map(s => ({ kind: s.kind, start: koreanExecutionInput(s.start), end: s.end ? koreanExecutionInput(s.end) : "" })) : [{ kind: "work", start: "", end: "" }] };
}
export function validExecutionEditor(value: unknown): value is ExecutionEditorDraft {
  if (!value || typeof value !== "object") return false;
  const v = value as ExecutionEditorDraft;
  return Object.keys(v).length === 3 && (v.expected === null || validExecutionRecord(v.expected) && v.expected.endedAt !== null) && typeof v.taskId === "string" && v.taskId.length <= 1000 && Array.isArray(v.rows) && v.rows.length >= 1 && v.rows.length <= 64 && v.rows.every(r => r && Object.keys(r).length === 3 && ["work", "break"].includes(r.kind) && [r.start, r.end].every(t => typeof t === "string" && t.length <= 30));
}
export function previewExecutionEditor(value: ExecutionEditorDraft, task: Task | undefined, now: string): ExecutionRecord {
  if (!validExecutionEditor(value)) throw new Error("실제 시간 입력을 확인해주세요.");
  const segments: ExecutionSegment[] = value.rows.map(r => ({ kind: r.kind, start: executionInputTime(r.start), end: executionInputTime(r.end) }));
  if (value.expected) return correctExecution(value.expected, segments, now);
  if (!task) throw new Error("기록할 할 일을 선택해주세요.");
  return manualExecution(task, "00000000-0000-4000-8000-000000000001", segments, now);
}
