import type { ExecutionRecord } from "../../supabase/functions/_shared/execution.ts";
import type { Task } from "../../supabase/functions/_shared/plan.ts";
import { restAlertSegment } from "./rest-alert.ts";

export type ExecutionTimerSource = { scope: string; record: ExecutionRecord | null; task: Task | null; clockOffsetMs: number; blocked: boolean; breakLimitMinutes: number | null; breakSegmentKey?: string | null };
export type ExecutionTimerPublication = Omit<ExecutionTimerSource, "clockOffsetMs"> & { now: string | null };
let current: ExecutionTimerSource | null = null;
let clockSource: string | null = null;
const listeners = new Set<() => void>();
export const getExecutionTimerSource = () => current;
export function subscribeExecutionTimerSource(notify: () => void) {
  listeners.add(notify);
  return () => { listeners.delete(notify); };
}
export function publishExecutionTimerSource(value: ExecutionTimerPublication) {
  const { now, ...source } = value;
  const sameClock = current?.scope === source.scope && clockSource === now;
  const clockOffsetMs = sameClock ? current!.clockOffsetMs : now === null ? 0 : Date.parse(now) - Date.now();
  clockSource = now;
  const breakLimitMinutes = source.breakSegmentKey && source.breakSegmentKey === restAlertSegment(source.record)?.key ? source.breakLimitMinutes : null;
  current = { ...source, breakLimitMinutes, clockOffsetMs, blocked: source.blocked || now === null || !Number.isFinite(clockOffsetMs) };
  for (const notify of listeners) notify();
}
export function clearExecutionTimerSource(scope: string) {
  if (current?.scope !== scope) return;
  current = null; clockSource = null;
  for (const notify of listeners) notify();
}
