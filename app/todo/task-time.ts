import { hasTaskTime, validTaskTime } from "../../supabase/functions/_shared/plan.ts";

export type TaskTimeDraft = {
  minutes: number | null;
  bufferMinutes: number | null;
  error: string;
};

// Persisted minutes include both work and buffer; the editor shows them separately.
export function parseTaskTimeDraft(
  work: string,
  buffer: string,
): TaskTimeDraft {
  const empty = { minutes: null, bufferMinutes: null };
  if (!work.trim() && !buffer.trim()) return { ...empty, error: "" };
  if (!work.trim() || !buffer.trim()) {
    return { ...empty, error: "작업 시간과 여유 시간을 모두 입력해주세요." };
  }
  const workMinutes = Number(work);
  const bufferMinutes = Number(buffer);
  if (!Number.isInteger(workMinutes) || workMinutes < 1) {
    return { ...empty, error: "작업 시간은 1분 이상의 정수로 입력해주세요." };
  }
  if (!Number.isInteger(bufferMinutes) || bufferMinutes < 1) {
    return { ...empty, error: "여유 시간은 1분 이상의 정수로 입력해주세요." };
  }
  const minutes = workMinutes + bufferMinutes;
  if (!validTaskTime(minutes, bufferMinutes)) {
    return {
      ...empty,
      error: "작업 시간과 여유 시간의 합계는 240분 이하여야 해요.",
    };
  }
  return { minutes, bufferMinutes, error: "" };
}

export function workFromStoredTime(
  minutes: number | null,
  bufferMinutes: number | null,
): string {
  const time = { minutes, bufferMinutes };
  return hasTaskTime(time) ? String(time.minutes - time.bufferMinutes) : "";
}
