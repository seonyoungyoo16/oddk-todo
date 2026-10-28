import type { Plan, Task } from "../../supabase/functions/_shared/plan.ts";
import { validPlan } from "../../supabase/functions/_shared/plan.ts";
import { addCalendarDays, isPlanDate } from "../../supabase/functions/_shared/calendar.ts";
import { isoWeekday, validRepeatRule } from "../../supabase/functions/_shared/repeat-calendar.ts";
import type { RepeatRule } from "../../supabase/functions/_shared/repeat-calendar.ts";
import { reminderOptions, repeatTemplateFrom, segmentAt } from "../../supabase/functions/_shared/recurrence.ts";
import { createRecurrence, detachRepeatOccurrence, preserveManualRepeatEdits, stopRecurrence, updateRecurrence } from "../../supabase/functions/_shared/repeat-actions.ts";
import { sameValue } from "./json-equality.ts";

export type RepeatDraft = { action: "keep" | "create" | "update" | "stop" | "detach"; scope: "this" | "future" | "all"; seriesId: string; frequency: "daily" | "weekly" | "monthly"; interval: string; weekdays: number[]; until: string };
export function validRepeatDraft(value: unknown): value is RepeatDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as RepeatDraft;
  return ["keep", "create", "update", "stop", "detach"].includes(v.action) && ["this", "future", "all"].includes(v.scope) && typeof v.seriesId === "string" && v.seriesId.length <= 60 && ["daily", "weekly", "monthly"].includes(v.frequency) && typeof v.interval === "string" && v.interval.length <= 10 && typeof v.until === "string" && v.until.length <= 10 && Array.isArray(v.weekdays) && v.weekdays.length <= 7 && new Set(v.weekdays).size === v.weekdays.length && v.weekdays.every(day => Number.isInteger(day) && day >= 1 && day <= 7);
}
export function initialRepeatDraft(task: Task, plan: Plan): RepeatDraft {
  const source = plan.recurrences?.find(series => series.id === task.repeatSeriesId);
  const rule = source && segmentAt(source, task.repeatDate!)?.rule;
  const date = task.repeatDate ?? task.plannedDate;
  return { action: "keep", scope: "this", seriesId: source?.id ?? "", frequency: rule?.frequency ?? "daily", interval: String(rule?.interval ?? 1), weekdays: rule?.frequency === "weekly" ? [...rule.weekdays] : isPlanDate(date) ? [isoWeekday(date)] : [], until: rule?.untilDate ?? "" };
}
const links = (plan: Plan, id: string) => plan.goalTree.groups.filter(group => group.taskIds.includes(id)).map(group => group.id);
function meaning(task: Task) {
  return { ...task, notes: task.notes ?? "", importance: task.importance ?? "normal", categoryId: task.categoryId ?? null, tagIds: task.tagIds ?? [], dueDate: task.dueDate ?? null, dueTime: task.dueTime ?? null, reminderMinutes: task.reminderMinutes ?? null };
}
function editorBaseAllowed(expected: Plan, candidate: Plan, id: string): boolean {
  if (!validPlan(expected) || !validPlan(candidate) || expected.tasks.length !== candidate.tasks.length || !candidate.tasks.some(task => task.id === id)) return false;
  if (candidate.tasks.some((task, index) => task.id !== expected.tasks[index].id || task.id !== id && !sameValue(task, expected.tasks[index]))) return false;
  const rest = (plan: Plan) => { const value: Partial<Plan> = { ...plan }; delete value.tasks; delete value.goalTree; delete value.schemaVersion; return value; };
  const goals = (plan: Plan) => ({ ...plan.goalTree, groups: plan.goalTree.groups.map(group => ({ ...group, taskIds: group.taskIds.filter(task => task !== id), ...(group.missingTaskIds ? { missingTaskIds: group.missingTaskIds.filter(task => task !== id) } : {}) })) });
  return (candidate.schemaVersion === expected.schemaVersion || expected.schemaVersion === 5 && candidate.schemaVersion === 6) && sameValue(rest(expected), rest(candidate)) && sameValue(goals(expected), goals(candidate));
}
export type RepeatEditPreview = { expected: Plan; candidate: Plan; taskId: string; draft: RepeatDraft; reminder: string; today: string; next: Plan; created: number; removed: number; changed: number; protectedDone: number; requiresConfirmation: boolean };
export function previewRepeatEdit(expected: Plan, candidate: Plan, taskId: string, draft: RepeatDraft, reminder: string, today: string): RepeatEditPreview {
  // Clearing the clock explicitly clears its dependent reminder on save.
  const inputTask = candidate.tasks.find(task => task.id === taskId);
  if (candidate.schemaVersion === 6 && inputTask?.reminderMinutes != null && (!inputTask.plannedDate || !inputTask.startTime || inputTask.summaryOnly)) candidate = { ...candidate, tasks: candidate.tasks.map(task => task.id === taskId ? { ...task, reminderMinutes: null } : task) };
  if (!editorBaseAllowed(expected, candidate, taskId) || !validRepeatDraft(draft) || !isPlanDate(today) || typeof reminder !== "string" || reminder !== "" && !reminderOptions.map(String).includes(reminder)) throw new Error("반복·알림 입력과 최신 수정 내용을 확인해주세요.");
  const original = expected.tasks.find(task => task.id === taskId)!, edited = candidate.tasks.find(task => task.id === taskId)!;
  const configured = Boolean(edited.plannedDate && edited.startTime && !edited.summaryOnly);
  const reminderMinutes = configured && reminder !== "" ? Number(reminder) : null;
  let next: Plan = candidate;
  if (original.reminderMinutes !== undefined || reminderMinutes !== null) next = { ...next, schemaVersion: 6, tasks: next.tasks.map(task => task.id === taskId ? { ...task, reminderMinutes } : task) };
  const updated = next.tasks.find(task => task.id === taskId)!;
  const source = expected.recurrences?.find(series => series.id === original.repeatSeriesId);
  const anchor = draft.action === "update" && draft.scope === "all" ? source?.originDate : original.repeatDate ?? updated.plannedDate;
  function ruleAt(startDate: string): RepeatRule {
    const rule = { frequency: draft.frequency, startDate, untilDate: draft.until || null, interval: Number(draft.interval), ...(draft.frequency === "weekly" ? { weekdays: [...draft.weekdays] } : draft.frequency === "monthly" ? { monthDay: Number(startDate.slice(-2)) } : {}) };
    if (!/^\d+$/.test(draft.interval) || !validRepeatRule(rule)) throw new Error("반복 간격·요일·종료일을 확인해주세요. 종료일은 시작일 이후 또는 같은 날이어야 해요.");
    return rule;
  }
  const start = isPlanDate(anchor) && anchor > today ? anchor : today;
  const range = { from: start, through: addCalendarDays(start, 30) ?? "9999-12-31" };
  if (draft.action === "create") {
    if (original.repeatSeriesId || !updated.plannedDate) throw new Error("날짜가 있는 일반 할 일에서 반복을 시작해주세요.");
    next = createRecurrence(next, taskId, draft.seriesId, ruleAt(updated.plannedDate), range);
  } else if (draft.action === "update") {
    if (!source || draft.scope === "this") throw new Error("반복 설정 변경은 이번 이후 또는 전체 범위를 선택해주세요. 이번만의 내용 수정은 ‘이번 일정만 수정’을 사용해주세요.");
    if (updated.plannedDate !== original.plannedDate || updated.done !== original.done) throw new Error("이후·전체 변경에서 날짜와 완료 상태는 유지해주세요. 날짜 이동이나 상태 변경은 이번 일정만 수정에서 할 수 있어요.");
    // A completed occurrence supplies a new template without rewriting history.
    const base = original.done ? expected : next;
    next = updateRecurrence(base, source.id, original.repeatDate!, draft.scope, ruleAt(anchor!), repeatTemplateFrom(updated), range);
  } else if (draft.action === "stop") {
    if (!source) throw new Error("중단할 반복 원본을 확인해주세요.");
    if (!sameValue(meaning(original), meaning(updated)) || !sameValue(links(expected, taskId), links(candidate, taskId))) throw new Error("내용·알림 수정은 먼저 저장한 뒤 반복을 중단해주세요. 입력은 그대로 있어요.");
    next = stopRecurrence(expected, source.id, original.repeatDate!, draft.scope);
  } else if (draft.action === "detach") {
    if (!source) throw new Error("분리할 반복 일정을 확인해주세요.");
    next = detachRepeatOccurrence(next, taskId);
  } else next = preserveManualRepeatEdits(expected, next);
  if (!validPlan(next)) throw new Error("반복·알림 설정을 저장할 수 없어요. 날짜와 시간을 확인해주세요.");
  const beforeIds = new Set(expected.tasks.map(task => task.id)), afterIds = new Set(next.tasks.map(task => task.id));
  return { expected: structuredClone(expected), candidate: structuredClone(candidate), taskId, draft: structuredClone(draft), reminder, today, next,
    created: next.tasks.filter(task => !beforeIds.has(task.id)).length, removed: expected.tasks.filter(task => !afterIds.has(task.id)).length,
    changed: next.tasks.filter(task => beforeIds.has(task.id) && !sameValue(task, expected.tasks.find(old => old.id === task.id))).length,
    protectedDone: source ? expected.tasks.filter(task => task.repeatSeriesId === source.id && task.done && sameValue(task, next.tasks.find(item => item.id === task.id))).length : 0,
    requiresConfirmation: draft.action !== "keep" };
}
export function applyRepeatEdit(current: Plan, preview: RepeatEditPreview): Plan {
  if (!sameValue(current, preview.expected)) throw new Error("저장된 계획이 바뀌었어요. 입력은 유지하고 변경 범위를 다시 확인해주세요.");
  const fresh = previewRepeatEdit(preview.expected, preview.candidate, preview.taskId, preview.draft, preview.reminder, preview.today);
  if (!sameValue(fresh, preview)) throw new Error("변경안이 달라졌어요. 반복 범위를 다시 확인해주세요.");
  return fresh.next;
}
