import type { Plan, Task } from "../../supabase/functions/_shared/plan.ts";
import { hasTaskTime, validPlan, validTaskTime, isClock, isPlanDate } from "../../supabase/functions/_shared/plan.ts";
import { deriveScheduleEnd } from "../../supabase/functions/_shared/schedule.ts";
import { sameValue } from "./json-equality.ts";
import { travelPreviewWarnings } from "./travel-warnings.ts";

export type TaskDurationPreview = { expected: Plan; before: Task; after: Task; warnings: string[] };

// ALPEN buffer remains fixed; resizing changes the work portion of the block.
export function durationAfterDrag(minutes: number, bufferMinutes: number, delta: number) {
  if (!hasTaskTime({ minutes, bufferMinutes }) || !Number.isFinite(delta)) throw new Error("조절할 소요시간을 확인해주세요.");
  return Math.max(bufferMinutes + 1, Math.min(240, minutes + Math.round(delta / 5) * 5));
}

export function previewTaskDuration(plan: Plan, id: string, minutes: number): TaskDurationPreview {
  const task = plan.tasks.find(item => item.id === id);
  if (!validPlan(plan) || !task || task.done || task.summaryOnly || !hasTaskTime(task) || !isClock(task.startTime) || !isPlanDate(task.plannedDate)) throw new Error("날짜와 시간이 있는 진행 중 할 일만 조절할 수 있어요.");
  if (!validTaskTime(minutes, task.bufferMinutes)) throw new Error("작업 시간은 1분 이상, 여유 시간을 포함한 소요시간은 240분 이하여야 해요.");
  if (minutes === task.minutes) throw new Error("현재 소요시간과 같아요.");
  const end = deriveScheduleEnd(task.plannedDate, task.startTime, minutes);
  if (!end) throw new Error("변경한 종료 날짜가 지원 범위를 벗어나요.");
  const after: Task = { ...task, minutes, ...end, ...(task.repeatSeriesId ? { repeatException: true } : {}) };
  const next = { ...plan, tasks: plan.tasks.map(item => item.id === id ? after : item) };
  if (!validPlan(next)) throw new Error("변경한 소요시간과 종료 시각을 확인해주세요.");
  return { expected: structuredClone(plan), before: structuredClone(task), after,
    warnings: travelPreviewWarnings({ ...plan, tasks: plan.tasks.filter(item => item.id !== id) }, [after]) };
}

export function applyTaskDuration(plan: Plan, preview: TaskDurationPreview): Plan {
  if (!sameValue(plan, preview.expected)) throw new Error("계획이 바뀌었어요. 최신 시간표에서 소요시간을 다시 조절해주세요.");
  const fresh = previewTaskDuration(plan, preview.before.id, preview.after.minutes!);
  if (!sameValue(fresh, preview)) throw new Error("소요시간 미리보기가 달라졌어요. 다시 확인해주세요.");
  return { ...plan, tasks: plan.tasks.map(task => task.id === fresh.before.id ? fresh.after : task) };
}
