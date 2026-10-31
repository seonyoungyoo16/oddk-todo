import type { Plan, Task } from "../../supabase/functions/_shared/plan.ts";
import { hasTaskTime, isClock, isPlanDate, validPlan } from "../../supabase/functions/_shared/plan.ts";
import { deriveScheduleEnd } from "../../supabase/functions/_shared/schedule.ts";
import { unrestrictedDay } from "./activity-hours-model.ts";
import { weekDates } from "./calendar-range.ts";
import { selectDay } from "./day-selectors.ts";
import { availabilitySummary } from "./availability.ts";
import { layoutTimeline } from "./timeline.ts";
import { taskTitleKey } from "./task-identity.ts";
import { travelPreviewWarnings } from "./travel-warnings.ts";
import { sameValue } from "./json-equality.ts";
import { dateOrdinal } from "../../supabase/functions/_shared/calendar.ts";
import { parseTaskTimeDraft } from "./task-time.ts";
import { parseTaskCandidates } from "./batch-tasks.ts";

export const timetablePastels = [
  { fill: "#f7deda", ink: "#774947", darkFill: "#51383c", darkInk: "#f4d6d1" },
  { fill: "#fae5cc", ink: "#795735", darkFill: "#514333", darkInk: "#f6e0c2" },
  { fill: "#f5efc8", ink: "#6b632b", darkFill: "#49472e", darkInk: "#f2e9b9" },
  { fill: "#dceddf", ink: "#3c6650", darkFill: "#30483d", darkInk: "#ccebd9" },
  { fill: "#dceaf7", ink: "#41617d", darkFill: "#304355", darkInk: "#d1e5f6" },
  { fill: "#e9e1f5", ink: "#65517e", darkFill: "#42394f", darkInk: "#e5daf5" },
] as const;

export function timetableTone(task: Pick<Task, "id" | "categoryId" | "repeatSeriesId">): number {
  const key = task.repeatSeriesId ?? task.categoryId ?? task.id;
  let hash = 0;
  for (const character of key) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0;
  return hash % timetablePastels.length;
}

export function buildWeeklyTimetable(plan: Plan, date: string, visibleTasks = plan.tasks) {
  return weekDates(date).map(dayDate => {
    const fullDay = selectDay(plan.tasks, dayDate);
    const availability = availabilitySummary(fullDay, plan.availabilityByDate?.[dayDate] ?? unrestrictedDay);
    const conflicts = new Set(availability.overlaps.map(item => item.task.id));
    const layout = layoutTimeline(selectDay(visibleTasks, dayDate).scheduled, { start: 0, end: 1440, maxEnd: 1440 });
    return { date: dayDate, fixed: availability.fixed,
      tasks: layout.items.map(task => ({ ...task, conflict: task.conflict || conflicts.has(task.id) })) };
  });
}

export type TimetablePlacementDuration = { minutes: number; bufferMinutes: number };

export function previewTimetablePlacement(plan: Plan, taskId: string, date: string, time: string, duration?: TimetablePlacementDuration) {
  const before = plan.tasks.find(task => task.id === taskId);
  if (!validPlan(plan) || !before || before.done || before.summaryOnly) throw new Error("진행 중인 실행할 할 일만 시간표에 배치할 수 있어요.");
  const timed = hasTaskTime(before) ? before : { ...before, ...duration };
  if (!hasTaskTime(timed)) throw new Error("배치할 할 일의 작업 시간과 여유 시간을 입력해주세요.");
  if (!isPlanDate(date) || !isClock(time)) throw new Error("배치할 날짜와 시작 시각을 확인해주세요.");
  const end = deriveScheduleEnd(date, time, timed.minutes);
  if (!end) throw new Error("지원하는 날짜 범위 안에서 시간을 선택해주세요.");
  const after: Task = { ...timed, plannedDate: date, startTime: time, ...end, ...(before.repeatSeriesId ? { repeatException: true } : {}) };
  if (plan.tasks.some(task => task.id !== taskId && !task.done && !task.summaryOnly && taskTitleKey(task) === taskTitleKey(after))) throw new Error("같은 날짜와 시각에 같은 할 일이 있어요.");
  const next = { ...plan, tasks: plan.tasks.map(task => task.id === taskId ? after : task) };
  if (!validPlan(next)) throw new Error("배치할 할 일의 시간 설정을 확인해주세요.");
  return { expected: structuredClone(plan), next, before: structuredClone(before), after, warnings: travelPreviewWarnings({ ...plan, tasks: plan.tasks.filter(task => task.id !== taskId) }, [after]) };
}

export type TimetablePlacementPreview = ReturnType<typeof previewTimetablePlacement>;

export function applyTimetablePlacement(plan: Plan, preview: ReturnType<typeof previewTimetablePlacement>): Plan {
  if (!sameValue(plan, preview.expected)) throw new Error("계획이 바뀌었어요. 최신 시간표에서 배치를 다시 확인해주세요.");
  const duration = hasTaskTime(preview.before) ? undefined : { minutes: preview.after.minutes!, bufferMinutes: preview.after.bufferMinutes! };
  const fresh = previewTimetablePlacement(plan, preview.before.id, preview.after.plannedDate!, preview.after.startTime!, duration);
  if (!sameValue(fresh, preview)) throw new Error("배치할 내용이 바뀌었어요. 다시 확인해주세요.");
  return fresh.next;
}

export type TimetableTaskDraft = { id: string; title: string; notes: string; date: string; time: string; work: string; buffer: string; categoryId: string | null; tagIds: string[] };

export function previewNewTimetableTask(plan: Plan, draft: TimetableTaskDraft) {
  const title = parseTaskCandidates({ titles: [draft.title] })[0];
  if (!validPlan(plan) || !draft.id || plan.tasks.some(task => task.id === draft.id)) throw new Error("추가할 할 일을 확인해주세요. 기존 내용은 그대로 남아 있어요.");
  if (!isPlanDate(draft.date) || !isClock(draft.time)) throw new Error("추가할 날짜와 시작 시각을 확인해주세요.");
  const duration = parseTaskTimeDraft(draft.work, draft.buffer);
  if (duration.error) throw new Error(duration.error);
  if (duration.minutes === null) throw new Error("시간표에 표시할 작업 시간과 여유 시간을 입력해주세요.");
  const end = deriveScheduleEnd(draft.date, draft.time, duration.minutes);
  if (!end) throw new Error("추가할 일정의 종료 날짜를 확인해주세요.");
  const task: Task = { id: draft.id, title, notes: draft.notes, plannedDate: draft.date, startTime: draft.time, ...end,
    minutes: duration.minutes, bufferMinutes: duration.bufferMinutes, priority: "normal", importance: "normal", done: false,
    categoryId: draft.categoryId, tagIds: [...draft.tagIds], dueDate: null, dueTime: null };
  if (plan.tasks.some(item => !item.done && !item.summaryOnly && taskTitleKey(item) === taskTitleKey(task))) throw new Error("같은 날짜와 시각에 같은 할 일이 있어요.");
  const next = { ...plan, tasks: [...plan.tasks, task] };
  if (!validPlan(next)) throw new Error("할 일·메모·분류·시간을 확인해주세요. 입력은 그대로 남아 있어요.");
  return { expected: plan, draft: { ...draft, tagIds: [...draft.tagIds] }, task, next, warnings: travelPreviewWarnings(plan, [task]) };
}

export function applyNewTimetableTask(plan: Plan, preview: ReturnType<typeof previewNewTimetableTask>): Plan {
  if (!sameValue(plan, preview.expected)) throw new Error("계획이 바뀌었어요. 최신 시간표에서 다시 확인해주세요.");
  const fresh = previewNewTimetableTask(plan, preview.draft);
  if (!sameValue(fresh, preview)) throw new Error("추가할 내용이 바뀌었어요. 다시 확인해주세요.");
  return fresh.next;
}

export function timetableDragOffset(start: number, rawMinutes: number, sourceDate?: string, targetDate?: string) {
  if (!Number.isFinite(start) || start < 0 || start >= 1440 || !Number.isFinite(rawMinutes)) throw new Error("이동할 시각을 확인해주세요.");
  if ((sourceDate || targetDate) && (!isPlanDate(sourceDate) || !isPlanDate(targetDate))) throw new Error("이동할 날짜를 확인해주세요.");
  return { minutes: Math.max(-start, Math.min(1439 - start, Math.round(rawMinutes / 5) * 5)),
    days: sourceDate && targetDate ? dateOrdinal(targetDate) - dateOrdinal(sourceDate) : 0 };
}
