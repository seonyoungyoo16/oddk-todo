import { hasTaskTime, isClock } from "../../supabase/functions/_shared/plan.ts";
import type { Task } from "../../supabase/functions/_shared/plan.ts";

export function taskTimeLabel(task: Task): string {
  if (isClock(task.startTime) && isClock(task.endTime)) {
    return `${task.startTime}~${task.endDayOffset === 1 ? "다음 날 " : ""}${task.endTime}`;
  }
  return hasTaskTime(task) ? `소요 ${task.minutes}분` : "종일";
}
