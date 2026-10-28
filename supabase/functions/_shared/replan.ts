import { hasTaskTime, validPlan } from "./plan.ts";
import type { Plan, Task } from "./plan.ts";
import { clockMinute, dateOrdinal, isClock, isPlanDate } from "./calendar.ts";
import { defaultAvailability, deriveScheduleEnd, endBoundaryMinute, freeIntervals, intersectInterval } from "./schedule.ts";
import type { MinuteInterval } from "./schedule.ts";
import { deadlineMinute } from "./task-planning.ts";
import { preserveManualRepeatEdits } from "./repeat-actions.ts";
import { sameValue } from "./json-equality.ts";
export type ReplanOptions = { date: string; baseMinute: number; pinnedIds: string[] };
export type ReplanChange = { before: Task; after: Task; reason: string };
export type ReplanPreview = { expected: Plan; after: Plan; options: ReplanOptions; changes: ReplanChange[]; protected: { task: Task; reason: string }[]; unplaced: { task: Task; reason: string }[]; errors: string[]; availableMinutes: number; placedMinutes: number; firstStart: number | null };
const rank = { high: 0, normal: 1, low: 2 };
const object = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === "object" && !Array.isArray(v));
export function validReplanOptions(value: unknown): value is ReplanOptions {
  return object(value) && Object.keys(value).length === 3 && isPlanDate(value.date) && typeof value.baseMinute === "number" && Number.isInteger(value.baseMinute) && value.baseMinute >= 0 && value.baseMinute <= 1440 && Array.isArray(value.pinnedIds) && value.pinnedIds.length <= 5000 && value.pinnedIds.every(id => typeof id === "string" && id.length > 0 && id.length <= 1000) && new Set(value.pinnedIds).size === value.pinnedIds.length;
}
export function replanClock(iso: string) {
  const time = Date.parse(iso); if (!Number.isFinite(time)) throw new Error("현재 시각을 확인해주세요.");
  const local = new Date(time + 32400000).toISOString();
  return { date: local.slice(0, 10), minute: Number(local.slice(11, 13)) * 60 + Number(local.slice(14, 16)) + (local.slice(17, 23) === "00.000" ? 0 : 1) };
}
function interval(task: Task, date: string) {
  if (task.done || task.summaryOnly || !hasTaskTime(task) || !isClock(task.startTime) || !isPlanDate(task.plannedDate)) return null;
  const start = (dateOrdinal(task.plannedDate) - dateOrdinal(date)) * 1440 + clockMinute(task.startTime);
  return { start, end: start + task.minutes };
}
export function defaultReplanPins(plan: Plan, date: string, baseMinute: number) {
  return plan.tasks.filter(t => t.plannedDate === date && !t.done && !t.summaryOnly && (interval(t, date)?.start ?? -1) >= baseMinute).map(t => t.id);
}
export function previewReplan(plan: Plan, options: ReplanOptions): ReplanPreview {
  if (!validPlan(plan) || ![5, 6].includes(plan.schemaVersion) || !validReplanOptions(options)) throw new Error("재조정할 날짜·시각과 최신 계획을 확인해주세요.");
  const { date, baseMinute } = options, pins = new Set(options.pinnedIds), availability = plan.availabilityByDate?.[date] ?? defaultAvailability;
  const window = { start: Math.max(baseMinute, clockMinute(availability.start)), end: endBoundaryMinute(availability.end) };
  const eligible = plan.tasks.filter(t => t.plannedDate === date && !t.done && !t.summaryOnly);
  if (options.pinnedIds.some(id => !eligible.some(t => t.id === id && interval(t, date)))) throw new Error("보호할 일정이 바뀌었어요. 최신 계획에서 다시 확인해주세요.");
  const protectedRows: ReplanPreview["protected"] = [], protectedIntervals: { task: Task; start: number; end: number }[] = [];
  for (const task of plan.tasks) {
    const range = interval(task, date);
    if (task.plannedDate === date && task.done) protectedRows.push({ task, reason: "완료한 일 유지" });
    if (pins.has(task.id) || range && task.plannedDate !== date && range.start < 0 && range.end > baseMinute) {
      protectedRows.push({ task, reason: pins.has(task.id) ? "사용자가 보호한 일정" : "전날부터 이어지는 일정" });
      if (range) protectedIntervals.push({ task, ...range });
    }
  }
  const fixed = availability.fixed.map(b => ({ start: clockMinute(b.start), end: endBoundaryMinute(b.end), title: b.title }));
  const errors: string[] = [];
  for (const block of protectedIntervals) {
    if (block.end <= baseMinute) continue;
    const due = deadlineMinute(block.task);
    if (due !== null && dateOrdinal(date) * 1440 + block.end > due) errors.push(`보호 일정 ‘${block.task.title}’이 마감 이후에 끝나요.`);
    if (block.end > endBoundaryMinute(availability.end) || block.start < clockMinute(availability.start) && baseMinute < clockMinute(availability.start)) errors.push(`보호 일정 ‘${block.task.title}’이 남은 활동 시간 밖에 있어요.`);
    const remaining = intersectInterval(block, window);
    if (remaining && fixed.some(f => intersectInterval(f, remaining))) errors.push(`보호 일정 ‘${block.task.title}’이 고정·휴식과 겹쳐요.`);
    if (remaining && protectedIntervals.some(other => other.task.id !== block.task.id && intersectInterval(other, remaining))) errors.push(`보호 일정 ‘${block.task.title}’이 다른 보호 일정과 겹쳐요.`);
  }
  const occupied: MinuteInterval[] = [...fixed, ...protectedIntervals];
  const free = () => freeIntervals(window, occupied);
  const availableMinutes = free().reduce((sum, r) => sum + r.end - r.start, 0);
  const unplaced: ReplanPreview["unplaced"] = [], nextTasks = new Map<string, Task>();
  let placedMinutes = 0, firstStart: number | null = null;
  const candidates = eligible.filter(t => !pins.has(t.id)).map((task, index) => ({ task, index })).sort((a, b) => {
    const left = deadlineMinute(a.task) ?? Infinity, right = deadlineMinute(b.task) ?? Infinity;
    return (left === right ? 0 : left < right ? -1 : 1) || rank[a.task.importance ?? "normal"] - rank[b.task.importance ?? "normal"] || rank[a.task.priority] - rank[b.task.priority] || a.index - b.index;
  });
  if (!errors.length) for (const { task } of candidates) {
    let reason = "", placed: Task | null = null;
    const deadline = deadlineMinute(task), finishBy = deadline === null ? Infinity : deadline - dateOrdinal(date) * 1440;
    if (!hasTaskTime(task)) reason = "작업·여유 시간 미설정";
    else if (finishBy <= baseMinute) reason = "마감 지남 · 마감을 수정하거나 다른 날짜를 선택해주세요";
    else {
      const slots = free(), slot = slots.find(r => r.start + task.minutes <= Math.min(r.end, finishBy));
      if (slot) {
        const startTime = `${String(Math.floor(slot.start / 60)).padStart(2, "0")}:${String(slot.start % 60).padStart(2, "0")}`;
        const end = deriveScheduleEnd(date, startTime, task.minutes);
        if (end) { placed = { ...task, startTime, ...end }; occupied.push({ start: slot.start, end: slot.start + task.minutes }); placedMinutes += task.minutes; firstStart = firstStart === null ? slot.start : Math.min(firstStart, slot.start); }
        else reason = "종료 날짜가 지원 범위를 넘어요";
      } else if (slots.some(r => r.end - r.start >= task.minutes)) reason = "마감 전에 끝낼 수 있는 구간이 없어요";
      else if (slots.reduce((sum, r) => sum + r.end - r.start, 0) < task.minutes) reason = "남은 활동 시간이 부족해요";
      else reason = `여유 포함 ${task.minutes}분의 연속 구간이 없어요`;
    }
    if (placed) nextTasks.set(task.id, placed);
    else {
      unplaced.push({ task, reason });
      nextTasks.set(task.id, { ...task, startTime: null, endTime: null, endDate: null, endDayOffset: null, ...(task.reminderMinutes !== undefined ? { reminderMinutes: null } : {}) });
    }
  }
  const after = preserveManualRepeatEdits(plan, { ...plan, tasks: plan.tasks.map(t => nextTasks.get(t.id) ?? t) });
  if (!validPlan(after)) throw new Error("변경안을 검증하지 못했어요. 원래 계획은 유지했어요.");
  const afterById = new Map(after.tasks.map(t => [t.id, t]));
  const changes = plan.tasks.flatMap(before => { const next = afterById.get(before.id)!; return sameValue(before, next) ? [] : [{ before, after: next, reason: next.startTime === null ? "미배치 · 기존 시각 해제" + (before.reminderMinutes != null ? " · 알림 해제" : "") : "남은 빈 시간에 배치" }]; });
  return { expected: plan, after, options: { ...options, pinnedIds: [...options.pinnedIds] }, changes, protected: protectedRows, unplaced, errors, availableMinutes, placedMinutes, firstStart };
}
export function assertCurrentReplan(preview: ReplanPreview, now: string) {
  const clock = replanClock(now);
  if (clock.date !== preview.options.date || preview.firstStart !== null && preview.firstStart < clock.minute) throw new Error("미리보기의 시작 시각이나 날짜가 지났어요. 다시 미리보기를 만들어주세요.");
  if (preview.errors.length) throw new Error(preview.errors[0]);
}
