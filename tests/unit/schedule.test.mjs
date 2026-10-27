import test from "node:test";
import assert from "node:assert/strict";
import { calculateSchedule, deriveScheduleEnd, occupiedMinutes, mergeIntervals, freeIntervals, intersectInterval } from "../../supabase/functions/_shared/schedule.ts";
const input = { date: "2026-10-28", start: "09:00", endDate: "2026-10-28", end: "10:00", endDayOffset: 0, buffer: 10 };
test("explicit endpoints include buffer exactly once and preserve legacy total durations", () => {
  assert.deepEqual(calculateSchedule(input), { ok: true, minutes: 60, work: 50, buffer: 10, endDayOffset: 0 });
  assert.deepEqual(deriveScheduleEnd(input.date, input.start, 60), { endTime: "10:00", endDate: input.date, endDayOffset: 0 });
  for (const [start, minutes, buffer] of [["00:00", 2, 1], ["23:59", 240, 1], ["08:00", 240, 239]]) {
    const end = deriveScheduleEnd(input.date, start, minutes);
    const result = calculateSchedule({ date: input.date, start, end: end.endTime, endDate: end.endDate, endDayOffset: end.endDayOffset, buffer });
    assert.equal(result.ok, true); assert.equal(result.minutes, minutes); assert.equal(result.work + result.buffer, minutes);
  }
});
test("no next-day guessing; endpoints, dates and buffer must agree", () => {
  for (const patch of [{ start: "" }, { end: "24:00" }, { end: "08:00" }, { end: "09:00" }, { end: "13:01" }, { buffer: 0 }, { buffer: -1 }, { buffer: 60 }, { buffer: 1.5 }, { buffer: NaN }, { endDayOffset: 0.5 }, { endDayOffset: 2 }, { endDate: "2026-10-29" }, { date: "2026-02-30" }, { endDate: null }, { date: null }]) assert.equal(calculateSchedule({ ...input, ...patch }).ok, false, JSON.stringify(patch));
});
test("cross-midnight, leap and year changes require explicit end dates; floating legacy plans retain their offset", () => {
  for (const [date, endDate] of [["2026-10-31", "2026-11-01"], ["2026-12-31", "2027-01-01"], ["2024-02-28", "2024-02-29"], ["2024-02-29", "2024-03-01"]]) {
    assert.deepEqual(deriveScheduleEnd(date, "23:50", 30), { endDate, endTime: "00:20", endDayOffset: 1 });
    assert.equal(calculateSchedule({ date, start: "23:50", end: "00:20", endDate, endDayOffset: 1, buffer: 5 }).ok, true);
  }
  assert.deepEqual(deriveScheduleEnd(null, "23:50", 30), { endDate: null, endTime: "00:20", endDayOffset: 1 });
  assert.equal(calculateSchedule({ date: null, start: "23:50", endDate: null, end: "00:20", endDayOffset: 1, buffer: 5 }).ok, true);
  assert.equal(calculateSchedule({ date: null, start: "23:50", endDate: null, end: "00:20", endDayOffset: 0, buffer: 5 }).ok, false);
  assert.equal(deriveScheduleEnd("9999-12-31", "23:50", 30), null);
  assert.equal(deriveScheduleEnd("0001-01-01", "00:00", 30).endDate, "0001-01-01");
});
test("occupied time removes overlap while free slots clip to availability and fixed breaks", () => {
  const intervals = [{ start: 540, end: 600 }, { start: 570, end: 630 }];
  assert.equal(intervals.reduce((sum, interval) => sum + interval.end - interval.start, 0), 120);
  assert.equal(occupiedMinutes(intervals), 90); assert.deepEqual(mergeIntervals(intervals), [{ start: 540, end: 630 }]);
  const breaks = [{ start: 720, end: 780 }, { start: 750, end: 810 }, { start: 400, end: 550 }];
  assert.deepEqual(freeIntervals({ start: 540, end: 1080 }, [...intervals, ...breaks]), [{ start: 630, end: 720 }, { start: 810, end: 1080 }]);
  assert.equal(occupiedMinutes(freeIntervals({ start: 540, end: 1080 }, [...intervals, ...breaks])), 360);
  assert.deepEqual(intervals, [{ start: 540, end: 600 }, { start: 570, end: 630 }]);
  assert.equal(intersectInterval({ start: 540, end: 600 }, { start: 600, end: 660 }), null);
  assert.deepEqual(freeIntervals({ start: 100, end: 100 }, intervals), []);
});
