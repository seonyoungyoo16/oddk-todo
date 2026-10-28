import type { Plan, Task } from "../../supabase/functions/_shared/plan.ts";
import { hasTaskTime, validPlan } from "../../supabase/functions/_shared/plan.ts";
import { isClock, isPlanDate, addCalendarDays, clockMinute } from "../../supabase/functions/_shared/calendar.ts";
import { deriveScheduleEnd } from "../../supabase/functions/_shared/schedule.ts";
import { reorderVisibleTasks } from "./task-order.ts";
import { taskTitleKey } from "./task-identity.ts";
import { sameValue } from "./json-equality.ts";
import { travelPreviewWarnings } from "./travel-warnings.ts";

export type TimeMovePreview = { expected: Plan; before: Task; after: Task; warnings: string[] };

// Pointer and button/keyboard actions share the same ordered, filtered slots.
export function dropVisibleTask(plan: Plan, visible: string[], source: string, target: string): Plan {
  if (!visible.includes(source) || !visible.includes(target)) throw new Error("옮길 항목이 목록에 없어요. 최신 목록을 확인해주세요.");
  const next = visible.filter(id => id !== source);
  next.splice(visible.indexOf(target), 0, source);
  return reorderVisibleTasks(plan, visible, next);
}

export function shiftStart(date: string, time: string, delta: number) {
  if (!isPlanDate(date) || !isClock(time) || !Number.isInteger(delta)) throw new Error("옮길 날짜와 시각을 확인해주세요.");
  const minute = clockMinute(time) + delta;
  const movedDate = addCalendarDays(date, Math.floor(minute / 1440));
  if (!movedDate) throw new Error("옮길 날짜가 지원 범위를 벗어나요.");
  const within = ((minute % 1440) + 1440) % 1440;
  return { date: movedDate, time: `${String(Math.floor(within / 60)).padStart(2, "0")}:${String(within % 60).padStart(2, "0")}` };
}

export function previewTimeMove(plan: Plan, id: string, date: string, time: string): TimeMovePreview {
  const task = plan.tasks.find(item => item.id === id);
  if (!validPlan(plan) || !task || task.done || task.summaryOnly || !hasTaskTime(task) || !isClock(task.startTime) || !isPlanDate(task.plannedDate)) throw new Error("날짜와 시간이 있는 진행 중 할 일만 옮길 수 있어요.");
  if (!isPlanDate(date) || !isClock(time)) throw new Error("옮길 날짜와 시작 시각을 확인해주세요.");
  const end = deriveScheduleEnd(date, time, task.minutes);
  if (!end) throw new Error("종료 날짜를 계산할 수 없어요. 옮길 시각을 확인해주세요.");
  const after: Task = { ...task, plannedDate: date, startTime: time, ...end, ...(task.repeatSeriesId ? { repeatException: true } : {}) };
  if (sameValue(task, after)) throw new Error("현재 시각과 같아요. 다른 시각을 선택해주세요.");
  if (plan.tasks.some(other => other.id !== id && !other.done && !other.summaryOnly && taskTitleKey(other) === taskTitleKey(after))) throw new Error("같은 날짜와 시각에 같은 할 일이 있어요.");
  const others = { ...plan, tasks: plan.tasks.filter(item => item.id !== id) };
  const candidate = { ...plan, tasks: plan.tasks.map(item => item.id === id ? after : item) };
  if (!validPlan(candidate)) throw new Error("옮긴 계획이 유효하지 않아요. 날짜와 시간을 확인해주세요.");
  return { expected: structuredClone(plan), before: structuredClone(task), after, warnings: travelPreviewWarnings(others, [after]) };
}

export function applyTimeMove(plan: Plan, preview: TimeMovePreview): Plan {
  if (!sameValue(plan, preview.expected)) throw new Error("계획이 바뀌었어요. 최신 계획에서 이동을 다시 확인해주세요.");
  const fresh = previewTimeMove(plan, preview.before.id, preview.after.plannedDate!, preview.after.startTime!);
  if (!sameValue(fresh, preview)) throw new Error("이동 미리보기가 달라졌어요. 다시 확인해주세요.");
  return { ...plan, tasks: plan.tasks.map(task => task.id === preview.before.id ? fresh.after : task) };
}
