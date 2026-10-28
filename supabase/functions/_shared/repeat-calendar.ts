import { addCalendarDays, dateOrdinal, isPlanDate } from "./calendar.ts";

type BaseRule = { startDate: string; untilDate: string | null; interval: number };
export type RepeatRule = BaseRule & (
  { frequency: "daily" } |
  { frequency: "weekly"; weekdays: number[] } |
  { frequency: "monthly"; monthDay: number }
);
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
export function validRepeatRule(value: unknown): value is RepeatRule {
  if (!object(value) || !isPlanDate(value.startDate) || !(value.untilDate === null || isPlanDate(value.untilDate) && value.untilDate >= value.startDate) || !Number.isInteger(value.interval)) return false;
  const frequency = value.frequency;
  const max = frequency === "daily" ? 365 : frequency === "weekly" ? 52 : frequency === "monthly" ? 12 : 0;
  if ((value.interval as number) < 1 || (value.interval as number) > max) return false;
  const allowed = new Set(["frequency", "startDate", "untilDate", "interval", ...(frequency === "weekly" ? ["weekdays"] : frequency === "monthly" ? ["monthDay"] : [])]);
  if (Object.keys(value).some(key => !allowed.has(key))) return false;
  if (frequency === "weekly") return Array.isArray(value.weekdays) && value.weekdays.length > 0 && value.weekdays.length <= 7 && new Set(value.weekdays).size === value.weekdays.length && value.weekdays.every(day => Number.isInteger(day) && day >= 1 && day <= 7);
  return frequency === "daily" || frequency === "monthly" && Number.isInteger(value.monthDay) && (value.monthDay as number) >= 1 && (value.monthDay as number) <= 31;
}
// Monday=1, Sunday=7. UTC ordinal arithmetic also covers dates before 1970.
export function isoWeekday(date: string): number {
  if (!isPlanDate(date)) throw new Error("반복 날짜를 확인해주세요.");
  return ((dateOrdinal(date) + 3) % 7 + 7) % 7 + 1;
}
function matches(rule: RepeatRule, date: string): boolean {
  if (date < rule.startDate || rule.untilDate !== null && date > rule.untilDate) return false;
  if (rule.frequency === "daily") return (dateOrdinal(date) - dateOrdinal(rule.startDate)) % rule.interval === 0;
  if (rule.frequency === "weekly") {
    const weekStart = dateOrdinal(rule.startDate) - isoWeekday(rule.startDate) + 1;
    return Math.floor((dateOrdinal(date) - weekStart) / 7) % rule.interval === 0 && rule.weekdays.includes(isoWeekday(date));
  }
  const [year, month, day] = date.split("-").map(Number);
  const [anchorYear, anchorMonth] = rule.startDate.split("-").map(Number);
  return (year * 12 + month - anchorYear * 12 - anchorMonth) % rule.interval === 0 && day === rule.monthDay;
}
export function isRepeatDate(rule: RepeatRule, date: string): boolean {
  if (!validRepeatRule(rule) || !isPlanDate(date)) throw new Error("반복 규칙과 날짜를 확인해주세요.");
  return matches(rule, date);
}
export function repeatDates(rule: RepeatRule, from: string, through: string): string[] {
  if (!validRepeatRule(rule) || !isPlanDate(from) || !isPlanDate(through) || through < from) throw new Error("반복 조회 기간을 확인해주세요.");
  const days = dateOrdinal(through) - dateOrdinal(from);
  if (days >= 366) throw new Error("반복 일정은 한 번에 최대366일 범위로 조회해주세요.");
  const result: string[] = [];
  for (let offset = 0; offset <= days; offset++) {
    const date = addCalendarDays(from, offset)!;
    if (matches(rule, date)) result.push(date);
  }
  return result;
}
export function repeatOccurrenceId(seriesId: string, originalDate: string): string {
  if (!/^[a-zA-Z0-9_-]{1,60}$/.test(seriesId) || !isPlanDate(originalDate)) throw new Error("반복 원본과 발생 날짜를 확인해주세요.");
  return `repeat:${seriesId}:${originalDate}`;
}
