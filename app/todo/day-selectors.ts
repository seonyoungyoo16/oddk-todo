import { hasTaskTime, isPlanDate } from "../../supabase/functions/_shared/plan.ts";
import type { Task } from "../../supabase/functions/_shared/plan.ts";
import { taskDaySlice, taskTouchesDate } from "./task-period.ts";

export function selectDay(allTasks: Task[], date: string) {
  const tasks = isPlanDate(date) ? allTasks.filter((task) => taskTouchesDate(task, date)) : [];
  const active = tasks.filter((task) => !task.done);
  const timed = tasks.filter(hasTaskTime);
  const timedActive = active.filter(hasTaskTime);
  const portion = (task: typeof timed[number]) => { const slice = taskDaySlice(task, date); return { minutes: slice?.segmentMinutes ?? task.minutes, buffer: slice?.segmentBuffer ?? task.bufferMinutes }; };
  const total = timed.reduce((sum, task) => sum + portion(task).minutes, 0);
  const buffer = timed.reduce((sum, task) => sum + portion(task).buffer, 0);
  const activeTotal = timedActive.reduce((sum, task) => sum + portion(task).minutes, 0);
  const activeBuffer = timedActive.reduce((sum, task) => sum + portion(task).buffer, 0);
  const scheduled = timedActive.map(task => taskDaySlice(task, date)).filter((slice): slice is NonNullable<typeof slice> => slice !== null).sort((a, b) => a.start - b.start);
  const byPriority = { high: 0, normal: 0, low: 0 };
  const byImportance = { high: 0, normal: 0, low: 0 };
  for (const task of timed) byPriority[task.priority] += portion(task).minutes;
  for (const task of timed) byImportance[task.importance ?? "normal"] += portion(task).minutes;
  return {
    date, tasks, active, timed, timedActive, scheduled,
    total, buffer, work: total - buffer,
    activeTotal, activeBuffer, activeWork: activeTotal - activeBuffer,
    completedCount: tasks.length - active.length,
    completedMinutes: timed.filter((task) => task.done).reduce((sum, task) => sum + portion(task).minutes, 0),
    untimedCount: tasks.length - timed.length,
    activeUntimedCount: active.length - timedActive.length,
    highPriorityCount: active.filter((task) => task.priority === "high").length,
    byPriority, byImportance, highImportanceCount: active.filter(task => task.importance === "high").length,
  };
}
export type DayPlan = ReturnType<typeof selectDay>;
