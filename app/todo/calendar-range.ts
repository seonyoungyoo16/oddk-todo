import { isPlanDate, addCalendarDays } from "../../supabase/functions/_shared/calendar.ts";
import type { Task } from "../../supabase/functions/_shared/plan.ts";
export type RangeScope = "day" | "week" | "all";
export function shiftDate(date: string, days: number): string | null {
  return addCalendarDays(date, days);
}
export function weekDates(date: string): string[] {
  if (!isPlanDate(date)) return [];
  const weekday = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, i) => shiftDate(date, i - weekday)).filter((day): day is string => day !== null);
}
export function selectRangeTasks(tasks: Task[], date: string, scope: RangeScope): Task[] {
  if (scope === "all") return tasks;
  const dates = new Set(scope === "week" ? weekDates(date) : isPlanDate(date) ? [date] : []);
  return tasks.filter(task => task.plannedDate !== null && dates.has(task.plannedDate));
}
export function dayLabel(date: string, weekday = true): string {
  if (!isPlanDate(date)) return "날짜를 선택해주세요";
  const [year, month, day] = date.split("-").map(Number);
  const label = `${year}년 ${month}월 ${day}일`;
  return weekday ? `${label} (${["일", "월", "화", "수", "목", "금", "토"][new Date(`${date}T12:00:00Z`).getUTCDay()]})` : label;
}
