import { executionPhase, executionTotals } from "../../supabase/functions/_shared/execution.ts";
import type { ExecutionRecord } from "../../supabase/functions/_shared/execution.ts";
import { hasTaskTime } from "../../supabase/functions/_shared/plan.ts";
import type { Task } from "../../supabase/functions/_shared/plan.ts";
import { restAlertSegment } from "./rest-alert.ts";

/** Elapsed active time; paused intervals are excluded by executionTotals. */
export function formatExecutionClock(milliseconds: number): string {
  const seconds = Math.floor(Math.max(0, Number.isFinite(milliseconds) ? milliseconds : 0) / 1000);
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(value => String(value).padStart(2, "0")).join(":");
}

export type ExecutionTimerProgress = NonNullable<ReturnType<typeof executionTimerProgress>>;

/** Current limits are a projection, never a rewrite of the historical execution snapshot.
 * ALPEN buffer is not an independent rest limit. A caller must explicitly supply one.
 */
export function executionTimerProgress(record: ExecutionRecord | null, task: Task | null, now: string, breakLimitMinutes: number | null = null) {
  if (!record || record.endedAt !== null || !task || task.id !== record.taskId || task.done || task.summaryOnly) return null;
  const phase = executionPhase(record);
  const kind = phase === "paused" ? record.segments.at(-1)!.kind : phase;
  if (kind !== "work" && kind !== "break") return null;
  const totals = executionTotals(record, now);
  const workLimit = hasTaskTime(task) ? task.minutes - task.bufferMinutes : null;
  const minutes = kind === "work" ? workLimit : breakLimitMinutes;
  const limitMs = minutes !== null && Number.isInteger(minutes) && minutes > 0 && minutes <= 240 ? minutes * 60000 : null;
  const restSegment = restAlertSegment(record);
  const restSegmentMs = restSegment ? Math.max(0, Date.parse(restSegment.segment.end ?? now) - Date.parse(restSegment.segment.start)) : 0;
  const elapsedMs = kind === "work" ? totals.workMs : restSegmentMs;
  const remainingMs = limitMs === null ? null : Math.max(0, limitMs - elapsedMs);
  const overdue = limitMs !== null && elapsedMs >= limitMs && !totals.clockIssue;
  const deadline = remainingMs === null || phase === "paused" || totals.clockIssue ? null : Date.parse(now) + remainingMs;
  return {
    recordId: record.id, taskId: task.id, title: task.title, phase, kind,
    workMs: totals.workMs, breakMs: totals.breakMs, restSegmentMs, limitMs, remainingMs,
    overdueMs: limitMs === null ? 0 : Math.max(0, elapsedMs - limitMs), overdue,
    alertKey: limitMs === null ? null : kind === "break" ? `${record.id}:break:${restSegment?.key}:${limitMs}` : `${record.id}:${kind}:${limitMs}`,
    deadlineAt: deadline === null ? null : new Date(deadline).toISOString(),
  };
}

/** Claim once per execution/kind/limit; polling or pause/resume must not repeat it. */
export function claimExecutionTimerAlert(progress: Pick<ExecutionTimerProgress, "overdue" | "alertKey" | "title" | "kind"> | null, seen: Set<string>) {
  if (!progress?.overdue || !progress.alertKey || seen.has(progress.alertKey)) return null;
  seen.add(progress.alertKey);
  return `${progress.title} · 계획한 ${progress.kind === "work" ? "작업" : "휴식"} 시간이 지났어요.`;
}
