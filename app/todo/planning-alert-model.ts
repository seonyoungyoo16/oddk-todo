import type { DayPlan } from "./day-selectors.ts";
import type { Availability } from "../../supabase/functions/_shared/schedule.ts";
import { isPlanDate } from "../../supabase/functions/_shared/calendar.ts";
import { availabilitySummary } from "./availability.ts";
import { clockLabel } from "./timeline.ts";
import { unrestrictedDay } from "./activity-hours-model.ts";

export type PlanningIssue = { id: string; title: string; start: number | null; end: number | null; time: string; reasons: string[] };

export function planningAlertReport(day: DayPlan, availability: Availability | undefined) {
  const summary = availabilitySummary(day, availability ?? unrestrictedDay);
  const issues = new Map<string, PlanningIssue>();
  const links = new Map<string, string[]>();
  const excessMinutes = availability ? Math.max(0, day.activeTotal - summary.availableMinutes) : 0;
  function add(id: string, reason: string) {
    const task = day.active.find(task => task.id === id);
    if (!task) return;
    const slice = day.scheduled.find(task => task.id === id);
    const issue = issues.get(id) ?? { id, title: task.title, start: slice?.start ?? null, end: slice?.end ?? null,
      time: slice ? `${clockLabel(slice.start)}–${clockLabel(slice.end)}` : "시각 미설정", reasons: [] };
    if (!issue.reasons.includes(reason)) issue.reasons.push(reason);
    issues.set(id, issue);
  }
  for (const task of summary.outside) add(task.id, "활동 시간 밖");
  for (const { task, others, fixed } of summary.overlaps) {
    if (others.length) add(task.id, "다른 일정과 겹침");
    if (fixed.length) add(task.id, "고정·휴식과 겹침");
    links.set(task.id, [...others.map(other => `${other.id}:${other.start}:${other.end}`), ...fixed.map(block => `${block.id}:${block.start}:${block.end}`)].sort());
  }
  if (excessMinutes) for (const task of day.timedActive) add(task.id, "가용 시간 초과");
  const entries = [...issues.values()].sort((a, b) => (a.start ?? Infinity) - (b.start ?? Infinity) || a.id.localeCompare(b.id));
  // The persisted key contains only a compact, deterministic signature. Titles,
  // display order, filters and unrelated healthy tasks do not change it.
  const signature = JSON.stringify([day.date, availability?.start ?? null, availability?.end ?? null, excessMinutes,
    [...entries].sort((a, b) => a.id.localeCompare(b.id)).map(issue => [issue.id, issue.start, issue.end, issue.reasons, links.get(issue.id), excessMinutes ? day.timedActive.find(task => task.id === issue.id)?.minutes : null])]);
  let first = 0x811c9dc5, second = 0x9e3779b9;
  for (let index = 0; index < signature.length; index++) {
    const code = signature.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619) >>> 0;
    second = Math.imul(second ^ code, 2246822519) >>> 0;
  }
  const key = entries.length ? `${day.date}:${first.toString(16).padStart(8, "0")}${second.toString(16).padStart(8, "0")}` : "";
  return { key, date: day.date, window: availability ? `${availability.start}–${availability.end}` : "미설정", issues: entries,
    outsideCount: summary.outside.length, overlapCount: summary.overlaps.length, excessMinutes };
}
export type PlanningAlertReport = ReturnType<typeof planningAlertReport>;

export function validPlanningDismissals(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 100 && new Set(value).size === value.length &&
    value.every(key => typeof key === "string" && /^\d{4}-\d{2}-\d{2}:[a-f0-9]{16}$/.test(key) && isPlanDate(key.slice(0, 10)));
}
export function dismissPlanningAlert(keys: string[], key: string) {
  return validPlanningDismissals([key]) ? [...keys.filter(item => item !== key).slice(-99), key] : keys;
}
