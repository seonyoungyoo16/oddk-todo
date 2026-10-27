// Pure contract for Next.js, Node tests and Deno; no runtime-specific APIs.
import { isClock, isPlanDate } from "./calendar.ts";
export { isClock, isPlanDate } from "./calendar.ts";
export type Priority = "high" | "normal" | "low";
export type Task = { id: string; title: string; minutes: number | null; bufferMinutes: number | null; startTime: string | null; priority: Priority; done: boolean; plannedDate: string | null; notes?: string };
export type Mandala = { goal: string; areas: Array<{ title: string; taskIds: string[] }> };
export type Plan = { schemaVersion: 3; tasks: Task[]; start: string; mandala?: Mandala; review?: string; reviewsByDate: Record<string, string> };
export type LegacyPlan = { tasks: Array<Omit<Task, "plannedDate">>; start: string; mandala?: Mandala; review?: string };
export type PlanV2 = Omit<Plan, "schemaVersion"> & { schemaVersion: 2 };
export type PlanData = Plan | PlanV2 | LegacyPlan;

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);


export function hasTaskTime<T extends { minutes: unknown; bufferMinutes: unknown }>(value: T): value is T & { minutes: number; bufferMinutes: number } {
  const { minutes, bufferMinutes } = value;
  return typeof minutes === "number" && Number.isInteger(minutes) && minutes >= 2 && minutes <= 240 &&
    typeof bufferMinutes === "number" && Number.isInteger(bufferMinutes) && bufferMinutes >= 1 && bufferMinutes < minutes;
}

export function validTaskTime(minutes: unknown, bufferMinutes: unknown, startTime: unknown = null): boolean {
  const configured = hasTaskTime({ minutes, bufferMinutes });
  if (!configured && !(minutes === null && bufferMinutes === null)) return false;
  return startTime === null || (configured && isClock(startTime));
}

export function validMandala(value: unknown): value is Mandala {
  return record(value) && typeof value.goal === "string" && value.goal.length <= 100 &&
    Array.isArray(value.areas) && value.areas.length === 8 && value.areas.every((area: unknown) =>
      record(area) && typeof area.title === "string" && area.title.length <= 60 &&
      Array.isArray(area.taskIds) && area.taskIds.length === 8 && area.taskIds.every((id: unknown) => typeof id === "string" && id.length <= 100));
}


export function validPlan(value: unknown): value is PlanData {
  if (!record(value) || !Array.isArray(value.tasks) || value.tasks.length > 5000 || !isClock(value.start)) return false;
  if (value.schemaVersion !== undefined && value.schemaVersion !== 2 && value.schemaVersion !== 3) return false;
  const ids = new Set<string>();
  for (const task of value.tasks) {
    if (!record(task) || typeof task.id !== "string" || !task.id || ids.has(task.id) ||
      typeof task.title !== "string" || !task.title.trim() || task.title.length > 120 ||
      typeof task.done !== "boolean" || typeof task.priority !== "string" || !["high", "normal", "low"].includes(task.priority) ||
      !validTaskTime(task.minutes, task.bufferMinutes, task.startTime ?? null) ||
      ((value.schemaVersion === 2 || value.schemaVersion === 3) && task.startTime === undefined) ||
      ((value.schemaVersion === 2 || value.schemaVersion === 3) && task.plannedDate !== null && !isPlanDate(task.plannedDate)) ||
      (task.notes !== undefined && (typeof task.notes !== "string" || task.notes.length > 2000)) ||
      (value.schemaVersion === 3 && typeof task.notes !== "string")) return false;
    ids.add(task.id);
  }
  if (value.review != null && (typeof value.review !== "string" || value.review.length > 2000)) return false;
  if (value.mandala != null && !validMandala(value.mandala)) return false;
  if ((value.schemaVersion === 2 || value.schemaVersion === 3) && (!record(value.reviewsByDate) || !Object.entries(value.reviewsByDate).every(([date, review]) => isPlanDate(date) && typeof review === "string" && review.length <= 2000))) return false;
  return true;
}
