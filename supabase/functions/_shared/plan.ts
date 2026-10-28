// Pure contract for Next.js, Node tests and Deno; no runtime-specific APIs.
import { isClock, isPlanDate } from "./calendar.ts";
import { calculateSchedule, validAvailability } from "./schedule.ts";
import type { Availability } from "./schedule.ts";
import { validCategories, validTags, validTaskClassification, validTaxonomyReferences } from "./taxonomy.ts";
import type { Category, Tag, TaskClassification } from "./taxonomy.ts";
import { validTaskPlanning } from "./task-planning.ts";
import type { TaskPlanning } from "./task-planning.ts";
import { validGoalTree } from "./goal-tree.ts";
import type { GoalTree } from "./goal-tree.ts";
import { validHierarchyShape, validTaskParents } from "./task-hierarchy.ts";
import type { TaskHierarchy } from "./task-hierarchy.ts";
export type { Category, Tag } from "./taxonomy.ts";
export { isClock, isPlanDate } from "./calendar.ts";
export type Priority = "high" | "normal" | "low";
export type Task = { id: string; title: string; minutes: number | null; bufferMinutes: number | null; startTime: string | null; priority: Priority; done: boolean; plannedDate: string | null; notes?: string; endTime?: string | null; endDate?: string | null; endDayOffset?: 0 | 1 | null } & TaskClassification & TaskPlanning & TaskHierarchy;
export type Mandala = { goal: string; areas: Array<{ title: string; taskIds: string[] }> };
export type Plan = { schemaVersion: 5; goalTree: GoalTree; tasks: Task[]; start: string; mandala?: Mandala; review?: string; reviewsByDate: Record<string, string>; availabilityByDate?: Record<string, Availability>; categories?: Category[]; tags?: Tag[] };
export type LegacyPlan = { tasks: Array<Omit<Task, "plannedDate">>; start: string; mandala?: Mandala; review?: string };
export type PlanV2 = Omit<Plan, "schemaVersion" | "goalTree"> & { schemaVersion: 2; goalTree?: GoalTree };
export type PlanV3 = Omit<PlanV2, "schemaVersion"> & { schemaVersion: 3 };
export type PlanV4 = Omit<PlanV2, "schemaVersion"> & { schemaVersion: 4 };
export type PlanData = Plan | PlanV4 | PlanV3 | PlanV2 | LegacyPlan;

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


export function validTaskSnapshot(task: unknown, schemaVersion: number | undefined): task is Task {
  if (schemaVersion !== undefined && ![2, 3, 4, 5].includes(schemaVersion)) return false;
    if (!record(task) || typeof task.id !== "string" || !task.id ||
      typeof task.title !== "string" || !task.title.trim() || task.title.length > 120 ||
      typeof task.done !== "boolean" || typeof task.priority !== "string" || !["high", "normal", "low"].includes(task.priority) ||
      !validTaskTime(task.minutes, task.bufferMinutes, task.startTime ?? null) ||
      (schemaVersion !== undefined && task.startTime === undefined) ||
      (schemaVersion !== undefined && task.plannedDate !== null && !isPlanDate(task.plannedDate)) ||
      (task.notes !== undefined && (typeof task.notes !== "string" || task.notes.length > 2000)) ||
      ((schemaVersion !== undefined && schemaVersion >= 3) && typeof task.notes !== "string") || !validTaskClassification(task) || !validTaskPlanning(task) || !validHierarchyShape(task, schemaVersion)) return false;
    const explicitEnd = schemaVersion === 4 || schemaVersion === 5 || ["endTime", "endDate", "endDayOffset"].some(key => Object.hasOwn(task, key));
    if (explicitEnd) {
      if (task.startTime === null) {
        if (task.endTime !== null || task.endDate !== null || task.endDayOffset !== null) return false;
      } else {
        if (typeof task.endTime !== "string" || (task.endDate !== null && !isPlanDate(task.endDate)) || (task.endDayOffset !== 0 && task.endDayOffset !== 1) || typeof task.bufferMinutes !== "number") return false;
        const result = calculateSchedule({ date: task.plannedDate as string | null, start: task.startTime as string, endDate: task.endDate as string | null, end: task.endTime, endDayOffset: task.endDayOffset, buffer: task.bufferMinutes });
        if (!result.ok || result.minutes !== task.minutes) return false;
      }
    }
  return true;
}

export function validPlan(value: unknown): value is PlanData {
  if (!record(value) || !Array.isArray(value.tasks) || value.tasks.length > 5000 || !isClock(value.start)) return false;
  if (value.schemaVersion !== undefined && (typeof value.schemaVersion !== "number" || ![2, 3, 4, 5].includes(value.schemaVersion))) return false;
  const ids = new Set<string>();
  for (const task of value.tasks) {
    if (!validTaskSnapshot(task, value.schemaVersion as number | undefined) || ids.has(task.id)) return false;
    ids.add(task.id);
  }
  if (value.review != null && (typeof value.review !== "string" || value.review.length > 2000)) return false;
  if (value.mandala != null && !validMandala(value.mandala)) return false;
  if (value.schemaVersion !== undefined && (!record(value.reviewsByDate) || !Object.entries(value.reviewsByDate).every(([date, review]) => isPlanDate(date) && typeof review === "string" && review.length <= 2000))) return false;
  if (value.availabilityByDate !== undefined && (!record(value.availabilityByDate) || Object.keys(value.availabilityByDate).length > 3660 || !Object.entries(value.availabilityByDate).every(([date, availability]) => isPlanDate(date) && validAvailability(availability)))) return false;
  if (value.categories !== undefined && !validCategories(value.categories)) return false;
  if (value.tags !== undefined && !validTags(value.tags)) return false;
  if (!validTaxonomyReferences(value.tasks, value.categories as Category[] | undefined, value.tags as Tag[] | undefined)) return false;
  if (value.schemaVersion === 5 && (!validGoalTree(value.goalTree, value.tasks, value.mandala as Mandala | undefined) || !validTaskParents(value.tasks))) return false;
  if (value.schemaVersion !== 5 && value.goalTree !== undefined && !validGoalTree(value.goalTree, value.tasks, value.mandala as Mandala | undefined)) return false;
  return true;
}
