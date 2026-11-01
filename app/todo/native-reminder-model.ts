import { validPlan } from "../../supabase/functions/_shared/plan.ts";
import { reminderWindow } from "../../supabase/functions/_shared/push-reminder.ts";

export const NATIVE_REMINDER_OWNER = "oddk.task-reminder.v1";
export const IOS_REMINDER_LIMIT = 64;
export type ReminderExtra = { owner: string; scope: string; taskId: string; date: string; signature: string };
export type NativeReminder = { id: number; title: string; body: string; sound: string; schedule: { at: Date }; extra: ReminderExtra };
export type ObservedReminder = { id: number; extra?: unknown };
export type ReminderSource = { scope: string; raw: string; blocked: boolean };
export function reminderExtra(notification: ObservedReminder): ReminderExtra | null {
  const value = notification.extra as Partial<ReminderExtra> | null;
  return value && value.owner === NATIVE_REMINDER_OWNER && typeof value.scope === "string" && typeof value.taskId === "string" && typeof value.date === "string" && typeof value.signature === "string" ? value as ReminderExtra : null;
}
function hashId(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return (hash >>> 0) % 2147483647 + 1;
}
export function nativeReminderPlan(source: ReminderSource, now: number, reservedIds: number[] = []) {
  const plan: unknown = JSON.parse(source.raw);
  if (source.blocked || !source.scope || source.scope === "unreadable-session" || !validPlan(plan) || !Number.isFinite(now)) throw Error("저장된 계획을 확인할 때까지 일정 알림을 중지했어요. 할 일과 계정 상태를 확인해주세요.");
  if (!("schemaVersion" in plan) || plan.schemaVersion !== 6) return { all: [], pending: [], deferred: 0 };
  const occupied = new Set(reservedIds), all: NativeReminder[] = [];
  for (const task of [...plan.tasks].sort((a, b) => a.id.localeCompare(b.id))) {
    const window = reminderWindow(task);
    if (!window) continue;
    let id = hashId(JSON.stringify([source.scope, task.id]));
    while (occupied.has(id)) id = id % 2147483647 + 1;
    occupied.add(id);
    const signature = JSON.stringify([source.scope, task.id, task.title, window.startAt, window.dueAt]);
    all.push({ id, title: task.title, body: `${task.startTime} 시작 예정`, sound: "default", schedule: { at: new Date(window.dueAt) }, extra: { owner: NATIVE_REMINDER_OWNER, scope: source.scope, taskId: task.id, date: task.plannedDate!, signature } });
  }
  const future = all.filter(item => item.schedule.at.getTime() > now).sort((a, b) => a.schedule.at.getTime() - b.schedule.at.getTime() || a.id - b.id);
  const capacity = Math.max(0, IOS_REMINDER_LIMIT - reservedIds.length);
  return { all, pending: future.slice(0, capacity), deferred: Math.max(0, future.length - capacity) };
}
