import { validPlan, validTaskSnapshot } from "./plan.ts";
import type { Task } from "./plan.ts";
import { isExecutionTask } from "./task-hierarchy.ts";

export type ReminderWindow = { startAt: string; dueAt: string; expiresAt: string };
export function reminderWindow(task: Task): ReminderWindow | null {
  if (!validTaskSnapshot(task, 6) || task.done || !isExecutionTask(task) || !task.plannedDate || !task.startTime || task.reminderMinutes === null || task.reminderMinutes === undefined || typeof task.minutes !== "number") return null;
  const start = Date.parse(`${task.plannedDate}T${task.startTime}:00+09:00`);
  const due = start - task.reminderMinutes * 60000;
  const expires = Math.min(start + 120000, due + 300000, start + task.minutes * 60000);
  if (![start, due, expires].every(Number.isFinite) || due >= expires) return null;
  return { startAt: new Date(start).toISOString(), dueAt: new Date(due).toISOString(), expiresAt: new Date(expires).toISOString() };
}
export function currentReminder(plan: unknown, taskId: string, window: ReminderWindow, now: Date): Task | null {
  if (!validPlan(plan) || !("schemaVersion" in plan) || plan.schemaVersion !== 6) return null;
  const task = plan.tasks.find(t => t.id === taskId);
  if (!task) return null;
  const actual = reminderWindow(task);
  if (!actual || !Number.isFinite(now.getTime()) || Date.parse(actual.dueAt) > now.getTime() || Date.parse(actual.expiresAt) <= now.getTime()) return null;
  if ((["startAt", "dueAt", "expiresAt"] as const).some(key => Date.parse(actual[key]) !== Date.parse(window[key]))) return null;
  return task;
}
