import { isClock, isPlanDate, clockMinute, dateOrdinal, addCalendarDays } from "./calendar.ts";

export type FixedTime = { id: string; title: string; start: string; end: string };
export type Availability = { start: string; end: string; fixed: FixedTime[] };
export const defaultAvailability: Availability = { start: "09:00", end: "18:00", fixed: [] };
export function endBoundaryMinute(clock: string): number { return clock === "24:00" ? 1440 : clockMinute(clock); }
const validDayInterval = (value: { start?: unknown; end?: unknown }) => isClock(value.start) && (isClock(value.end) || value.end === "24:00") && endBoundaryMinute(value.end as string) > clockMinute(value.start);
export function validAvailability(value: unknown): value is Availability {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Availability;
  if (!validDayInterval(v) || !Array.isArray(v.fixed) || v.fixed.length > 30) return false;
  const ids = new Set<string>();
  return v.fixed.every(interval => {
    if (!interval || typeof interval !== "object" || typeof interval.id !== "string" || !interval.id || interval.id.length > 100 || ids.has(interval.id) || typeof interval.title !== "string" || !interval.title.trim() || interval.title.length > 60 || !validDayInterval(interval)) return false;
    ids.add(interval.id); return true;
  });
}

export type ScheduleInput = { date: string | null; start: string; endDate: string | null; end: string; endDayOffset: number; buffer: number };
export type ScheduleResult = { ok: true; minutes: number; work: number; buffer: number; endDayOffset: 0 | 1 } | { ok: false; error: string };

// The offset must be explicit even for a floating, undated time plan.
export function calculateSchedule(input: ScheduleInput): ScheduleResult {
  if (!isClock(input.start) || !isClock(input.end)) return { ok: false, error: "시작과 종료 시각을 모두 올바르게 입력해주세요." };
  if (input.endDayOffset !== 0 && input.endDayOffset !== 1) return { ok: false, error: "종료는 같은 날 또는 다음 날로 명시해주세요." };
  if (input.date === null) {
    if (input.endDate !== null) return { ok: false, error: "시작 날짜를 선택하거나 종료 날짜를 비워주세요." };
  } else {
    if (!isPlanDate(input.date) || !isPlanDate(input.endDate)) return { ok: false, error: "시작과 종료 날짜를 올바르게 입력해주세요." };
    if (dateOrdinal(input.endDate) - dateOrdinal(input.date) !== input.endDayOffset) return { ok: false, error: "종료 날짜와 같은 날·다음 날 설정이 일치하지 않아요." };
  }
  const minutes = clockMinute(input.end) - clockMinute(input.start) + input.endDayOffset * 1440;
  if (minutes < 2 || minutes > 240) return { ok: false, error: "종료는 시작 이후여야 하며, 여유를 포함한 수행 시간은 2~240분이어야 해요." };
  if (!Number.isInteger(input.buffer) || input.buffer < 1 || input.buffer >= minutes) return { ok: false, error: "여유는 1분 이상, 수행 시간보다 작게 입력해주세요." };
  return { ok: true, minutes, work: minutes - input.buffer, buffer: input.buffer, endDayOffset: input.endDayOffset };
}

export function deriveScheduleEnd(date: string | null, start: string, minutes: number) {
  if ((date !== null && !isPlanDate(date)) || !isClock(start) || !Number.isInteger(minutes) || minutes < 2 || minutes > 240) return null;
  const end = clockMinute(start) + minutes;
  const endDayOffset: 0 | 1 = end >= 1440 ? 1 : 0;
  const endDate = date === null ? null : addCalendarDays(date, endDayOffset);
  if (date !== null && endDate === null) return null;
  return { endTime: `${String(Math.floor(end / 60) % 24).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`, endDate, endDayOffset };
}

export type MinuteInterval = { start: number; end: number };
export function mergeIntervals(intervals: MinuteInterval[]): MinuteInterval[] {
  const sorted = intervals.filter(interval => Number.isFinite(interval.start) && Number.isFinite(interval.end) && interval.end > interval.start).map(interval => ({ ...interval })).sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: MinuteInterval[] = [];
  for (const interval of sorted) {
    const last = merged.at(-1);
    if (last && interval.start <= last.end) last.end = Math.max(last.end, interval.end);
    else merged.push(interval);
  }
  return merged;
}
export function occupiedMinutes(intervals: MinuteInterval[]): number { return mergeIntervals(intervals).reduce((sum, interval) => sum + interval.end - interval.start, 0); }
export function intersectInterval(interval: MinuteInterval, window: MinuteInterval): MinuteInterval | null {
  const start = Math.max(interval.start, window.start), end = Math.min(interval.end, window.end);
  return end > start ? { start, end } : null;
}
export function freeIntervals(window: MinuteInterval, occupied: MinuteInterval[]): MinuteInterval[] {
  if (window.end <= window.start) return [];
  const clipped = occupied.map(interval => intersectInterval(interval, window)).filter((interval): interval is MinuteInterval => interval !== null);
  const free: MinuteInterval[] = []; let cursor = window.start;
  for (const interval of mergeIntervals(clipped)) { if (cursor < interval.start) free.push({ start: cursor, end: interval.start }); cursor = interval.end; }
  if (cursor < window.end) free.push({ start: cursor, end: window.end });
  return free;
}
