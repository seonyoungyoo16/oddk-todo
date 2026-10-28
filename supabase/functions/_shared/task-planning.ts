import { isClock, isPlanDate, clockMinute, dateOrdinal } from "./calendar.ts";
export type Importance = "high" | "normal" | "low";
export type TaskPlanning = { importance?: Importance; dueDate?: string | null; dueTime?: string | null };
export function validTaskPlanning(task: Record<string, unknown>): boolean {
  return (task.importance === undefined || typeof task.importance === "string" && ["high", "normal", "low"].includes(task.importance)) &&
    (task.dueDate === undefined || task.dueDate === null || isPlanDate(task.dueDate)) &&
    (task.dueTime === undefined || task.dueTime === null || (isClock(task.dueTime) && isPlanDate(task.dueDate)));
}
// Date-only deadlines expire at the following midnight; no host timezone inference.
export function deadlineMinute(task: TaskPlanning): number | null {
  if (!isPlanDate(task.dueDate)) return null;
  return dateOrdinal(task.dueDate) * 1440 + (isClock(task.dueTime) ? clockMinute(task.dueTime) : 1440);
}
