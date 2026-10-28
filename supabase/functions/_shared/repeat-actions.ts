import type { Plan, Task } from "./plan.ts";
import { validPlan } from "./plan.ts";
import { isPlanDate, addCalendarDays } from "./calendar.ts";
import { isRepeatDate, repeatDates, validRepeatRule } from "./repeat-calendar.ts";
import type { RepeatRule } from "./repeat-calendar.ts";
import { repeatTemplateFrom, segmentAt, seriesOccurrenceId, templateTask, validRepeatSeries, validRepeatTemplate } from "./recurrence.ts";
import type { RepeatSeries, RepeatTemplate } from "./recurrence.ts";
import { unlinkGoalTasks } from "./goal-tree.ts";
import { sameValue } from "./json-equality.ts";

export type RepeatRange = { from: string; through: string };
export type RepeatScope = "this" | "future" | "all";
const titleKey = (task: Task) => JSON.stringify([task.title.trim().normalize("NFC").toLocaleLowerCase(), task.plannedDate, task.startTime]);
function checked(plan: Plan): Plan {
  if (!validPlan(plan)) throw new Error("반복 규칙·업무5000개·목표 연결 한도를 확인해주세요. 기존 계획은 유지했어요.");
  return plan;
}
function checkRange(range: RepeatRange) {
  repeatDates({ frequency: "daily", startDate: range.from, untilDate: null, interval: 1 }, range.from, range.through);
}
function duplicateGuard(tasks: Task[], changed: Set<string>) {
  const others = new Set(tasks.filter(task => !changed.has(task.id) && !task.done && !task.summaryOnly).map(titleKey)), keys = new Set<string>();
  for (const task of tasks.filter(task => changed.has(task.id) && !task.done && !task.summaryOnly)) {
    const key = titleKey(task);
    if (others.has(key) || keys.has(key)) throw new Error("같은 날짜와 시각에 같은 할 일이 있어요. 반복 범위나 기존 일정을 확인해주세요.");
    keys.add(key);
  }
}
function sourceSeries(plan: Plan, id: string): RepeatSeries {
  const source = plan.recurrences?.find(series => series.id === id);
  if (!validPlan(plan) || plan.schemaVersion !== 6 || !source) throw new Error("반복 원본이 바뀌었어요. 최신 계획을 확인해주세요.");
  return source;
}
function occurrence(series: RepeatSeries, date: string): Task | null {
  if (series.skippedDates.includes(date)) return null;
  const segment = segmentAt(series, date);
  if (!segment?.rule || !isRepeatDate(segment.rule, date)) return null;
  return { ...templateTask(segment.template, date, seriesOccurrenceId(series, date)), repeatSeriesId: series.id, repeatDate: date };
}

// The range is a bounded window, not a loop from the series' historical anchor.
export function materializeRecurrences(plan: Plan, range: RepeatRange, seriesIds?: Set<string>): Plan {
  checked(plan); checkRange(range);
  if (!plan.recurrences?.length) return plan;
  const tasks = [...plan.tasks], byId = new Map(tasks.map(task => [task.id, task])), added = new Map<string, string[]>();
  const active = new Set(tasks.filter(task => !task.done && !task.summaryOnly).map(titleKey));
  for (const series of plan.recurrences) {
    if (seriesIds && !seriesIds.has(series.id)) continue;
    for (let index = 0; index < series.segments.length; index++) {
      const segment = series.segments[index];
      if (!segment.rule || segment.fromDate > range.through) continue;
      const from = segment.fromDate > range.from ? segment.fromDate : range.from;
      const boundary = series.segments[index + 1]?.fromDate;
      const through = boundary && boundary <= range.through ? addCalendarDays(boundary, -1)! : range.through;
      if (through < from) continue;
      for (const date of repeatDates(segment.rule, from, through)) {
        const next = occurrence(series, date);
        if (!next) continue;
        const existing = byId.get(next.id);
        if (existing) {
          if (existing.repeatSeriesId !== series.id || existing.repeatDate !== date) throw new Error("반복 발생 ID가 기존 업무와 충돌해요. 원본은 유지했어요.");
          continue;
        }
        if (tasks.length >= 5000) throw new Error("반복 발생을 추가하면 업무5000개 한도를 넘어요. 기간을 줄이거나 지난 계획을 정리해주세요.");
        if (active.has(titleKey(next))) throw new Error("같은 날짜와 시각에 같은 할 일이 있어요. 기존 일정과 반복을 확인해주세요.");
        active.add(titleKey(next)); tasks.push(next); byId.set(next.id, next);
        for (const group of series.goalGroupIds) added.set(group, [...(added.get(group) ?? []), next.id]);
      }
    }
  }
  if (tasks.length === plan.tasks.length) return plan;
  return checked({ ...plan, tasks, goalTree: { ...plan.goalTree, groups: plan.goalTree.groups.map(group => added.has(group.id) ? { ...group, taskIds: [...new Set([...group.taskIds, ...added.get(group.id)!])] } : group) } });
}

export function createRecurrence(plan: Plan, taskId: string, seriesId: string, rule: RepeatRule, range: RepeatRange): Plan {
  checked(plan); checkRange(range);
  const task = plan.tasks.find(item => item.id === taskId);
  if (!task || task.done || task.summaryOnly || task.repeatSeriesId || !isPlanDate(task.plannedDate) || !validRepeatRule(rule) || rule.startDate !== task.plannedDate || !isRepeatDate(rule, task.plannedDate)) throw new Error("날짜가 있는 미완료 업무를 반복 시작일에 포함해주세요.");
  const source: RepeatSeries = { id: seriesId, originTaskId: task.id, originDate: task.plannedDate, segments: [{ fromDate: task.plannedDate, rule, template: repeatTemplateFrom(task) }], skippedDates: [], goalGroupIds: plan.goalTree.groups.filter(group => group.taskIds.includes(taskId)).map(group => group.id) };
  if (!validRepeatSeries(source) || plan.recurrences?.some(item => item.id === seriesId || item.originTaskId === taskId && !item.skippedDates.includes(item.originDate))) throw new Error("반복 원본 ID와 설정을 확인해주세요.");
  const next: Plan = { ...plan, schemaVersion: 6, recurrences: [...(plan.recurrences ?? []), source], tasks: plan.tasks.map(item => item.id === taskId ? { ...item, repeatSeriesId: seriesId, repeatDate: task.plannedDate! } : item) };
  return materializeRecurrences(checked(next), range, new Set([source.id]));
}

// Shared by delete, bulk delete and recurrence range edits. Ordinary user
// deletion records a skip; removing dates excluded by a new rule does not.
export function removeRepeatTasks(plan: Plan, ids: Set<string>, rememberSkip = true): Plan {
  const removed = plan.tasks.filter(task => ids.has(task.id));
  const recurrences = plan.recurrences?.map(series => ({ ...series,
    skippedDates: rememberSkip ? [...new Set([...series.skippedDates, ...removed.filter(task => task.repeatSeriesId === series.id).map(task => task.repeatDate!)])].sort() : series.skippedDates,
    segments: series.segments.map(segment => segment.template.parentTaskId && ids.has(segment.template.parentTaskId) ? { ...segment, template: { ...segment.template, parentTaskId: null } } : segment),
  }));
  return checked({ ...plan, tasks: plan.tasks.filter(task => !ids.has(task.id)).map(task => task.parentTaskId && ids.has(task.parentTaskId) ? { ...task, parentTaskId: null } : task), goalTree: unlinkGoalTasks(plan.goalTree, ids), ...(recurrences ? { recurrences } : {}) });
}
export function editRepeatOccurrence(plan: Plan, nextTask: Task): Plan {
  checked(plan);
  const current = plan.tasks.find(task => task.id === nextTask.id);
  if (!current?.repeatSeriesId || current.done) throw new Error("수정할 미완료 반복 일정을 확인해주세요.");
  if (nextTask.repeatSeriesId !== current.repeatSeriesId || nextTask.repeatDate !== current.repeatDate) throw new Error("원래 반복 발생 ID는 바꿀 수 없어요.");
  const next = { ...nextTask, repeatException: true };
  const tasks = plan.tasks.map(task => task.id === current.id ? next : task);
  duplicateGuard(tasks, new Set([current.id])); return checked({ ...plan, tasks });
}

export function detachRepeatOccurrence(plan: Plan, taskId: string): Plan {
  const task = plan.tasks.find(item => item.id === taskId);
  if (!task?.repeatSeriesId) return plan;
  sourceSeries(plan, task.repeatSeriesId);
  const detached = { ...task }; delete detached.repeatSeriesId; delete detached.repeatDate; delete detached.repeatException;
  return checked({ ...plan, tasks: plan.tasks.map(item => item.id === taskId ? detached : item), recurrences: plan.recurrences!.map(series => series.id === task.repeatSeriesId ? { ...series, skippedDates: [...new Set([...series.skippedDates, task.repeatDate!])].sort() } : series) });
}

// Called before recording browser undo. Single-item edits must not be silently
// replaced by a later template change; checking done alone is not an exception.
export function preserveManualRepeatEdits(before: Plan, after: Plan): Plan {
  if (after.schemaVersion !== 6 || !sameValue(before.recurrences, after.recurrences)) return after;
  const old = new Map(before.tasks.map(task => [task.id, task]));
  return { ...after, tasks: after.tasks.map(task => {
    const previous = old.get(task.id);
    if (!previous?.repeatSeriesId || task.repeatSeriesId !== previous.repeatSeriesId || task.repeatDate !== previous.repeatDate || task.repeatException) return task;
    return sameValue({ ...previous, done: task.done }, task) ? task : { ...task, repeatException: true };
  }) };
}

function replaceSegments(series: RepeatSeries, date: string, scope: "future" | "all", rule: RepeatRule | null, template: RepeatTemplate): RepeatSeries {
  if (scope !== "future" && scope !== "all") throw new Error("이번 이후 또는 전체 범위를 선택해주세요.");
  const fromDate = scope === "all" ? series.originDate : date;
  if (!isPlanDate(fromDate) || fromDate < series.originDate || rule !== null && (!validRepeatRule(rule) || rule.startDate !== fromDate) || !validRepeatTemplate(template)) throw new Error("수정 범위의 시작일과 반복 규칙을 확인해주세요.");
  return { ...series, segments: [...series.segments.filter(segment => segment.fromDate < fromDate), { fromDate, rule, template }] };
}
export function updateRecurrence(plan: Plan, id: string, date: string, scope: "future" | "all", rule: RepeatRule, template: RepeatTemplate, range: RepeatRange): Plan {
  checkRange(range); const source = sourceSeries(plan, id);
  const changed = replaceSegments(source, date, scope, rule, template), from = scope === "all" ? source.originDate : date;
  const removals = new Set<string>(), edited = new Set<string>();
  const tasks = plan.tasks.map(task => {
    if (task.repeatSeriesId !== id || task.repeatDate! < from || task.done || task.repeatException) return task;
    const next = occurrence(changed, task.repeatDate!);
    if (!next) { removals.add(task.id); return task; }
    edited.add(task.id); return next;
  });
  let next = { ...plan, tasks, recurrences: plan.recurrences!.map(series => series.id === id ? changed : series) };
  if (removals.size) next = removeRepeatTasks(next, removals, false) as typeof next;
  duplicateGuard(next.tasks, edited);
  return materializeRecurrences(checked(next), range, new Set([source.id]));
}
export function stopRecurrence(plan: Plan, id: string, date: string, scope: RepeatScope): Plan {
  const source = sourceSeries(plan, id);
  if (!isPlanDate(date) || date < source.originDate || !["this", "future", "all"].includes(scope)) throw new Error("중단할 발생 날짜와 범위를 확인해주세요.");
  if (scope === "this") {
    const existing = plan.tasks.find(task => task.repeatSeriesId === id && task.repeatDate === date);
    if (existing?.done) return plan;
    if (!existing && !occurrence(source, date) && !source.skippedDates.includes(date)) throw new Error("건너뛸 반복 발생 날짜를 확인해주세요.");
    const next = removeRepeatTasks(plan, new Set(existing ? [existing.id] : []), false);
    return checked({ ...next, recurrences: next.recurrences!.map(series => series.id === id ? { ...series, skippedDates: [...new Set([...series.skippedDates, date])].sort() } : series) });
  }
  const segment = segmentAt(source, date) ?? source.segments[0];
  const changed = replaceSegments(source, date, scope, null, segment.template), from = scope === "all" ? source.originDate : date;
  const ids = new Set(plan.tasks.filter(task => task.repeatSeriesId === id && task.repeatDate! >= from && !task.done).map(task => task.id));
  return removeRepeatTasks({ ...plan, recurrences: plan.recurrences!.map(series => series.id === id ? changed : series) }, ids, false);
}
