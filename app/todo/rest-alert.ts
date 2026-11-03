import { validExecutionRecord } from "../../supabase/functions/_shared/execution.ts";
import type { ExecutionRecord } from "../../supabase/functions/_shared/execution.ts";

export const REST_ALERT_MINUTES = [0, 5, 10, 15] as const;
export type RestAlertBinding = { scope: string; recordId: string; segmentKey: string; minutes: number | null };
/** A paused break keeps its identity; a new break always gets a new identity. */
export function restAlertSegment(record: ExecutionRecord | null) {
  if (!record || !validExecutionRecord(record) || record.endedAt !== null) return null;
  const index = record.segments.length - 1, segment = record.segments[index];
  if (segment.kind !== "break") return null;
  return { index, segment, key: JSON.stringify([record.id, index, segment.start]) };
}
export function parseRestAlert(raw: string | null): RestAlertBinding | null {
  try {
    const value = JSON.parse(raw ?? "null");
    if (!value || typeof value.scope !== "string" || !value.scope || typeof value.recordId !== "string" || typeof value.segmentKey !== "string"
      || !(value.minutes === null || REST_ALERT_MINUTES.slice(1).some(n => n === value.minutes))) return null;
    return value;
  } catch { return null; }
}
export function matchedRestAlert(scope: string, record: ExecutionRecord | null, binding: RestAlertBinding | null) {
  const segment = restAlertSegment(record);
  return binding && binding.scope === scope && binding.recordId === record?.id && binding.segmentKey === segment?.key ? binding : null;
}
export function bindRestAlert(scope: string, record: ExecutionRecord, minutes: number): RestAlertBinding {
  const segment = restAlertSegment(record);
  if (!scope || scope === "unreadable-session" || !segment || !REST_ALERT_MINUTES.some(n => n === minutes)) throw Error("현재 휴식과 알림 기준을 다시 확인해주세요.");
  return { scope, recordId: record.id, segmentKey: segment.key, minutes: minutes === 0 ? null : minutes };
}
export function confirmedRestStart(scope: string, previous: ExecutionRecord, nextScope: string, next: ExecutionRecord | null, minutes: number) {
  const segment = restAlertSegment(next);
  if (scope !== nextScope || !next || next.id !== previous.id || !segment || segment.index !== previous.segments.length
    || previous.segments.some((item, index) => item.kind !== next.segments[index]?.kind || item.start !== next.segments[index]?.start)) return null;
  return bindRestAlert(scope, next, minutes);
}
