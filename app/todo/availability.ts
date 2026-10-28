import type { DayPlan } from "./day-selectors.ts";
import type { Availability } from "../../supabase/functions/_shared/schedule.ts";
import { occupiedMinutes, freeIntervals, intersectInterval, endBoundaryMinute } from "../../supabase/functions/_shared/schedule.ts";
import { clockMinute } from "../../supabase/functions/_shared/calendar.ts";
export function availabilitySummary(day: DayPlan, availability: Availability) {
  const window = { start: clockMinute(availability.start), end: endBoundaryMinute(availability.end) };
  const fixed = availability.fixed.map(block => ({ ...block, start: clockMinute(block.start), end: endBoundaryMinute(block.end) }));
  const clip = (interval: { start: number; end: number }) => intersectInterval(interval, window);
  const fixedWithin = fixed.map(clip).filter((v): v is NonNullable<typeof v> => v !== null);
  const scheduledWithin = day.scheduled.map(clip).filter((v): v is NonNullable<typeof v> => v !== null);
  const free = freeIntervals(window, [...day.scheduled, ...fixed]);
  const scheduledMinutes = day.scheduled.reduce((sum, task) => sum + task.segmentMinutes, 0);
  const overlaps = day.scheduled.map(task => ({ task, others: day.scheduled.filter(other => other.id !== task.id && intersectInterval(task, other)), fixed: fixed.filter(block => intersectInterval(task, block)) })).filter(item => item.others.length || item.fixed.length);
  return { window, fixed, free, overlaps, activityMinutes: window.end - window.start, fixedMinutes: occupiedMinutes(fixedWithin), availableMinutes: window.end - window.start - occupiedMinutes(fixedWithin), occupiedMinutes: occupiedMinutes(day.scheduled), occupiedWithin: occupiedMinutes(scheduledWithin), freeMinutes: occupiedMinutes(free), overlapMinutes: scheduledMinutes - occupiedMinutes(day.scheduled), outside: day.scheduled.filter(task => task.start < window.start || task.end > window.end), unscheduledMinutes: day.activeTotal - scheduledMinutes };
}
