import type { Plan } from "./plan.ts";
import { addCalendarDays, dateOrdinal, isPlanDate } from "./calendar.ts";
import { materializeRecurrences } from "./repeat-actions.ts";
import type { RepeatRange } from "./repeat-actions.ts";

// Prepare a rolling month and, optionally, the visible bounded calendar range.
// Existing tasks (including moved, completed and skipped occurrences) survive.
export function prepareRepeatWindow(plan: Plan, today: string, visible?: RepeatRange): Plan {
  if (!isPlanDate(today)) throw new Error("반복 일정을 준비할 오늘 날짜를 확인해주세요.");
  if (visible && (!isPlanDate(visible.from) || !isPlanDate(visible.through) || visible.through < visible.from || dateOrdinal(visible.through) - dateOrdinal(visible.from) >= 366)) throw new Error("반복 조회는 유효한 날짜와 최대366일 범위로 선택해주세요.");
  const rolling = { from: today, through: addCalendarDays(today, 30) ?? "9999-12-31" };
  let next = materializeRecurrences(plan, rolling);
  if (visible && !(visible.from >= rolling.from && visible.through <= rolling.through && visible.from <= visible.through)) next = materializeRecurrences(next, visible);
  return next;
}
