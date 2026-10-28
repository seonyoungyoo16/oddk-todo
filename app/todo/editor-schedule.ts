import type { EditorDraft } from "./workspace-draft.ts";
import { parseTaskTimeDraft } from "./task-time.ts";
import { calculateSchedule, deriveScheduleEnd } from "../../supabase/functions/_shared/schedule.ts";
import { isPlanDate, dateOrdinal, addCalendarDays } from "../../supabase/functions/_shared/calendar.ts";

type TimeInput = Pick<EditorDraft, "work" | "buffer" | "start" | "date" | "timeMode" | "end" | "endDate" | "endDay">;
export const editorMode = (draft: TimeInput) => draft.timeMode ?? "legacy";
export function retargetEditorDate(draft: TimeInput, date: string): Partial<TimeInput> {
  const offset = draft.date && isPlanDate(draft.date) && isPlanDate(draft.endDate) ? dateOrdinal(draft.endDate) - dateOrdinal(draft.date) : Number(draft.endDay ?? 0);
  return { date, ...((offset === 0 || offset === 1) ? { endDate: date ? addCalendarDays(date, offset) ?? "" : "", endDay: String(offset) } : {}) };
}
export function endpointWindow(draft: TimeInput) {
  const offset = draft.date && isPlanDate(draft.date) && isPlanDate(draft.endDate) ? dateOrdinal(draft.endDate) - dateOrdinal(draft.date) : Number(draft.endDay ?? "0");
  return calculateSchedule({ date: draft.date || null, start: draft.start, end: draft.end ?? "", endDate: draft.date ? draft.endDate ?? draft.date : null, endDayOffset: offset, buffer: 1 });
}
export function parseEditorSchedule(draft: TimeInput) {
  const empty = { minutes: null, bufferMinutes: null, startTime: null, endTime: null, endDate: null, endDayOffset: null, work: null };
  const fail = (error: string) => ({ ...empty, error });
  if (draft.date && !isPlanDate(draft.date)) return fail("계획 날짜를 올바르게 선택해주세요.");
  if (editorMode(draft) === "clock") {
    if (!draft.start && !draft.end && !draft.buffer.trim()) return { ...empty, error: "" };
    const window = endpointWindow(draft);
    if (!window.ok) return fail(window.error);
    if (!draft.buffer.trim()) return fail("수행 시간에 포함할 여유 시간을 입력해주세요.");
    const buffer = Number(draft.buffer), offset = window.endDayOffset;
    const result = calculateSchedule({ date: draft.date || null, start: draft.start, end: draft.end ?? "", endDate: draft.date ? draft.endDate ?? draft.date : null, endDayOffset: offset, buffer });
    return result.ok ? { minutes: result.minutes, bufferMinutes: buffer, startTime: draft.start, endTime: draft.end!, endDate: draft.date ? draft.endDate ?? draft.date : null, endDayOffset: offset, work: result.work, error: "" } : fail(result.error);
  }
  const duration = parseTaskTimeDraft(draft.work, draft.buffer);
  if (duration.error) return fail(duration.error);
  const startTime = editorMode(draft) === "duration" ? null : draft.start || null;
  if (startTime && duration.minutes === null) return fail("시각을 보존하려면 작업과 여유 시간을 모두 입력해주세요.");
  const end = startTime && duration.minutes !== null ? deriveScheduleEnd(draft.date || null, startTime, duration.minutes) : null;
  if (startTime && !end) return fail("종료 날짜를 계산할 수 없어요. 날짜와 시각을 확인해주세요.");
  return { ...empty, ...duration, startTime, ...(end ?? {}), work: duration.minutes === null ? null : duration.minutes - duration.bufferMinutes! };
}
