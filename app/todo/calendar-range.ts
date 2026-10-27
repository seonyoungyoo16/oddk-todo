import { isPlanDate } from "../../supabase/functions/_shared/plan.ts";
import type { Task } from "../../supabase/functions/_shared/plan.ts";
export type RangeScope = "day" | "week" | "all";
export function shiftDate(date: string, days: number): string | null {
  if (!isPlanDate(date) || !Number.isInteger(days)) return null;
  const instant = new Date(`${date}T12:00:00Z`); instant.setUTCDate(instant.getUTCDate() + days);
  const year = instant.getUTCFullYear(); if (year < 1 || year > 9999) return null;
  return `${String(year).padStart(4, "0")}-${String(instant.getUTCMonth() + 1).padStart(2, "0")}-${String(instant.getUTCDate()).padStart(2, "0")}`;
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
