import type { Plan, Task } from "./plan.ts";
import { validTaskSnapshot } from "./plan.ts";
import { isClock, isPlanDate, addCalendarDays, dateOrdinal } from "./calendar.ts";
import { deriveScheduleEnd } from "./schedule.ts";
import { validRepeatRule, isRepeatDate, repeatOccurrenceId } from "./repeat-calendar.ts";
import type { RepeatRule } from "./repeat-calendar.ts";
import { validTaxonomyReferences } from "./taxonomy.ts";

export type RepeatTaskFields = { repeatSeriesId?: string; repeatDate?: string; repeatException?: boolean; reminderMinutes?: number | null };
export type RepeatTemplate = Pick<Task, "title" | "notes" | "minutes" | "bufferMinutes" | "startTime" | "priority" | "importance" | "categoryId" | "tagIds" | "parentTaskId" | "dueTime"> & { dueOffsetDays: number | null; reminderMinutes?: number | null };
export type RepeatSegment = { fromDate: string; rule: RepeatRule | null; template: RepeatTemplate };
export type RepeatSeries = { id: string; originTaskId: string; originDate: string; segments: RepeatSegment[]; skippedDates: string[]; goalGroupIds: string[] };
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
export const validSeriesId = (id: unknown): id is string => typeof id === "string" && /^[a-zA-Z0-9_-]{1,60}$/.test(id);
export const reminderOptions = [0, 5, 10, 15, 30, 60];
export function validRepeatTaskShape(task: Record<string, unknown>, schema: number | undefined): boolean {
  const keys = ["repeatSeriesId", "repeatDate", "repeatException", "reminderMinutes"];
  if (schema !== 6) return keys.every(key => !Object.hasOwn(task, key));
  const linked = task.repeatSeriesId !== undefined || task.repeatDate !== undefined || task.repeatException !== undefined;
  if (linked && (!validSeriesId(task.repeatSeriesId) || !isPlanDate(task.repeatDate) || task.summaryOnly === true || task.repeatException !== undefined && typeof task.repeatException !== "boolean")) return false;
  return task.reminderMinutes === undefined || task.reminderMinutes === null || Number.isInteger(task.reminderMinutes) && reminderOptions.includes(task.reminderMinutes as number) && isPlanDate(task.plannedDate) && typeof task.startTime === "string";
}
export function templateTask(template: RepeatTemplate, date: string, id: string): Task {
  const { dueOffsetDays, ...fields } = template;
  const end = template.startTime === null ? { endTime: null, endDate: null, endDayOffset: null } : deriveScheduleEnd(date, template.startTime, template.minutes!);
  const dueDate = dueOffsetDays === null ? null : addCalendarDays(date, dueOffsetDays);
  if (!end || dueOffsetDays !== null && !dueDate) throw new Error("반복 일정의 종료 또는 마감 날짜가 지원 범위를 넘어요.");
  return { ...structuredClone(fields), id, plannedDate: date, dueDate, dueTime: dueDate ? template.dueTime ?? null : null, done: false, ...end };
}
export function validRepeatTemplate(value: unknown): value is RepeatTemplate {
  if (!object(value) || !(value.dueOffsetDays === null || Number.isInteger(value.dueOffsetDays) && Math.abs(value.dueOffsetDays as number) <= 365) || !(value.dueTime === undefined || value.dueTime === null || value.dueOffsetDays !== null && isClock(value.dueTime))) return false;
  const allowed = new Set(["title", "notes", "minutes", "bufferMinutes", "startTime", "priority", "importance", "categoryId", "tagIds", "parentTaskId", "dueTime", "dueOffsetDays", "reminderMinutes"]);
  if (Object.keys(value).some(key => !allowed.has(key))) return false;
  try { return validTaskSnapshot(templateTask(value as RepeatTemplate, "2000-06-01", "repeat-template"), 6); } catch { return false; }
}
export function repeatTemplateFrom(task: Task): RepeatTemplate {
  if (!isPlanDate(task.plannedDate) || task.summaryOnly) throw new Error("날짜가 있는 실행 업무에서 반복을 설정해주세요.");
  const template: RepeatTemplate = {
    title: task.title, notes: task.notes ?? "", minutes: task.minutes, bufferMinutes: task.bufferMinutes, startTime: task.startTime,
    priority: task.priority, importance: task.importance ?? "normal", categoryId: task.categoryId ?? null, tagIds: [...(task.tagIds ?? [])], parentTaskId: task.parentTaskId ?? null,
    dueOffsetDays: task.dueDate ? dateOrdinal(task.dueDate) - dateOrdinal(task.plannedDate) : null, dueTime: task.dueTime ?? null,
    ...(task.reminderMinutes !== undefined ? { reminderMinutes: task.reminderMinutes } : {}),
  };
  if (!validRepeatTemplate(template)) throw new Error("반복할 내용·시간·마감을 확인해주세요. 마감 간격은 시작일 전후365일까지예요.");
  return template;
}
export function validRepeatSeries(value: unknown): value is RepeatSeries {
  if (!object(value) || !validSeriesId(value.id) || typeof value.originTaskId !== "string" || !value.originTaskId || value.originTaskId.length > 100 || !isPlanDate(value.originDate) || !Array.isArray(value.segments) || value.segments.length < 1 || value.segments.length > 64 || !Array.isArray(value.skippedDates) || value.skippedDates.length > 3660 || new Set(value.skippedDates).size !== value.skippedDates.length || !value.skippedDates.every(date => isPlanDate(date) && date >= (value.originDate as string)) || !Array.isArray(value.goalGroupIds) || value.goalGroupIds.length > 32 || new Set(value.goalGroupIds).size !== value.goalGroupIds.length || !value.goalGroupIds.every(id => typeof id === "string" && id.length > 0 && id.length <= 100)) return false;
  let previous = "";
  return value.segments.every((segment, index) => {
    if (!object(segment) || !isPlanDate(segment.fromDate) || segment.fromDate <= previous || index === 0 && segment.fromDate !== value.originDate || !validRepeatTemplate(segment.template) || !(segment.rule === null || validRepeatRule(segment.rule) && segment.rule.startDate === segment.fromDate)) return false;
    previous = segment.fromDate; return true;
  });
}
export function seriesOccurrenceId(series: RepeatSeries, date: string): string {
  return date === series.originDate ? series.originTaskId : repeatOccurrenceId(series.id, date);
}
export function segmentAt(series: RepeatSeries, date: string): RepeatSegment | undefined {
  return series.segments.findLast(segment => segment.fromDate <= date);
}
export function validRepeatPlan(plan: { schemaVersion?: number; tasks: Task[]; recurrences?: unknown; goalTree?: Plan["goalTree"]; categories?: Plan["categories"]; tags?: Plan["tags"] }): boolean {
  if (plan.schemaVersion !== 6) return plan.recurrences === undefined;
  if (plan.recurrences === undefined) return plan.tasks.every(task => task.repeatSeriesId === undefined);
  if (!Array.isArray(plan.recurrences) || plan.recurrences.length > 100 || !plan.recurrences.every(validRepeatSeries)) return false;
  const series = plan.recurrences as RepeatSeries[];
  if (new Set(series.map(item => item.id)).size !== series.length) return false;
  const taskIds = new Set(plan.tasks.map(task => task.id)), groupIds = new Set(plan.goalTree?.groups.map(group => group.id) ?? []);
  if (series.some(item => item.goalGroupIds.some(id => !groupIds.has(id)) || item.segments.some(segment => !validTaxonomyReferences([segment.template], plan.categories, plan.tags) || segment.template.parentTaskId != null && !taskIds.has(segment.template.parentTaskId)))) return false;
  const origins = new Set<string>();
  for (const item of series) {
    const first = item.segments[0];
    if (!item.skippedDates.includes(item.originDate) && first.rule && isRepeatDate(first.rule, item.originDate)) {
      if (origins.has(item.originTaskId)) return false;
      origins.add(item.originTaskId);
      const task = plan.tasks.find(task => task.id === item.originTaskId);
      if (task && (task.repeatSeriesId !== item.id || task.repeatDate !== item.originDate)) return false;
    }
  }
  const refs = new Set<string>();
  return plan.tasks.every(task => {
    if (task.repeatSeriesId === undefined) return true;
    const source = series.find(item => item.id === task.repeatSeriesId);
    if (!source || !isPlanDate(task.repeatDate) || task.repeatDate < source.originDate || task.id !== seriesOccurrenceId(source, task.repeatDate) || source.skippedDates.includes(task.repeatDate) && !task.done) return false;
    const key = `${source.id}:${task.repeatDate}`;
    if (refs.has(key)) return false; refs.add(key); return true;
  });
}
