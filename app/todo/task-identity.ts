import type { Task } from "../../supabase/functions/_shared/plan.ts";
// A title can recur on another date or at another start time.
export function taskTitleKey(task: Pick<Task, "title" | "plannedDate" | "startTime">): string {
  return JSON.stringify([task.title.trim().normalize("NFC").toLocaleLowerCase(), task.plannedDate, task.startTime]);
}
