import { hasTaskTime, isClock, isPlanDate } from "../../supabase/functions/_shared/plan.ts";
import type { Task } from "../../supabase/functions/_shared/plan.ts";
import { clockMinutes } from "./timeline.ts";

export function selectDay(allTasks: Task[], date: string) {
  const tasks = isPlanDate(date) ? allTasks.filter((task) => task.plannedDate === date) : [];
  const active = tasks.filter((task) => !task.done);
  const timed = tasks.filter(hasTaskTime);
  const timedActive = active.filter(hasTaskTime);
  const total = timed.reduce((sum, task) => sum + task.minutes, 0);
  const buffer = timed.reduce((sum, task) => sum + task.bufferMinutes, 0);
  const activeTotal = timedActive.reduce((sum, task) => sum + task.minutes, 0);
  const activeBuffer = timedActive.reduce((sum, task) => sum + task.bufferMinutes, 0);
  const scheduled = timedActive.filter((task) => isClock(task.startTime)).map((task) => ({ ...task, start: clockMinutes(task.startTime!), end: clockMinutes(task.startTime!) + task.minutes })).sort((a, b) => a.start - b.start);
  const byPriority = { high: 0, normal: 0, low: 0 };
  for (const task of timed) byPriority[task.priority] += task.minutes;
  return {
    date, tasks, active, timed, timedActive, scheduled,
    total, buffer, work: total - buffer,
    activeTotal, activeBuffer, activeWork: activeTotal - activeBuffer,
    completedCount: tasks.length - active.length,
    completedMinutes: timed.filter((task) => task.done).reduce((sum, task) => sum + task.minutes, 0),
    untimedCount: tasks.length - timed.length,
    activeUntimedCount: active.length - timedActive.length,
    highPriorityCount: active.filter((task) => task.priority === "high").length,
    byPriority,
  };
}
export type DayPlan = ReturnType<typeof selectDay>;
