import type { Plan, Task } from "../../supabase/functions/_shared/plan.ts";
import { unrestrictedDay } from "./activity-hours-model.ts";
import { selectDay } from "./day-selectors.ts";
import { availabilitySummary } from "./availability.ts";
export function travelPreviewWarnings(plan: Plan, tasks: Task[]): string[] {
  const ids = new Set(tasks.map(task => task.id)), warnings: string[] = [];
  const dates = [...new Set(tasks.flatMap(task => [task.plannedDate!, task.endDate!]))];
  for (const date of dates) {
    const saved = plan.availabilityByDate?.[date];
    const summary = availabilitySummary(selectDay([...plan.tasks, ...tasks], date), saved ?? unrestrictedDay);
    for (const overlap of summary.overlaps.filter(item => ids.has(item.task.id))) {
      for (const other of overlap.others.filter(task => !ids.has(task.id))) warnings.push(`${date} · ${overlap.task.title} ↔ ${other.title} 시간 겹침`);
      for (const fixed of overlap.fixed) warnings.push(`${date} · ${overlap.task.title} ↔ 고정·휴식 ${fixed.title} 시간 겹침`);
    }
    if (saved) for (const task of summary.outside.filter(task => ids.has(task.id))) warnings.push(`${date} · ${task.title}: 활동 시간 밖`);
  }
  return [...new Set(warnings)];
}
