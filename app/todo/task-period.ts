import { hasTaskTime } from "../../supabase/functions/_shared/plan.ts";
import type { Task } from "../../supabase/functions/_shared/plan.ts";
import { isClock, isPlanDate, dateOrdinal, clockMinute } from "../../supabase/functions/_shared/calendar.ts";
import { intersectInterval } from "../../supabase/functions/_shared/schedule.ts";
export function taskInterval(task: Task) {
  if (task.summaryOnly || !hasTaskTime(task) || !isClock(task.startTime) || !isPlanDate(task.plannedDate)) return null;
  const start = dateOrdinal(task.plannedDate) * 1440 + clockMinute(task.startTime);
  return { start, end: start + task.minutes, workEnd: start + task.minutes - task.bufferMinutes };
}
export function taskDaySlice(task: Task, date: string) {
  const interval = taskInterval(task);
  if (!interval || !isPlanDate(date) || !hasTaskTime(task)) return null;
  const dayStart = dateOrdinal(date) * 1440, dayEnd = dayStart + 1440;
  const slice = intersectInterval(interval, { start: dayStart, end: dayEnd });
  if (!slice) return null;
  const work = intersectInterval({ start: interval.start, end: interval.workEnd }, slice);
  const buffer = intersectInterval({ start: interval.workEnd, end: interval.end }, slice);
  return { ...task, start: slice.start - dayStart, end: slice.end - dayStart, segmentMinutes: slice.end - slice.start, segmentWork: work ? work.end - work.start : 0, segmentBuffer: buffer ? buffer.end - buffer.start : 0, continuesBefore: interval.start < dayStart, continuesAfter: interval.end > dayEnd };
}
export function taskTouchesDate(task: Task, date: string): boolean {
  if (!isPlanDate(date)) return false;
  return taskInterval(task) ? taskDaySlice(task, date) !== null : task.plannedDate === date;
}
