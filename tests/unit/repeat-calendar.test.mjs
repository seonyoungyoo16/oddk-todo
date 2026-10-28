import test from "node:test";
import assert from "node:assert/strict";
import { validRepeatRule, isoWeekday, isRepeatDate, repeatDates, repeatOccurrenceId } from "../../supabase/functions/_shared/repeat-calendar.ts";
const daily = (patch = {}) => ({ frequency: "daily", interval: 1, startDate: "2026-10-28", untilDate: null, ...patch });

test("daily intervals retain their anchor through filtered ranges and include the chosen final date", () => {
  const rule = daily({ interval: 2, untilDate: "2026-11-03" });
  assert.deepEqual(repeatDates(rule, "2026-10-29", "2026-11-04"), ["2026-10-30", "2026-11-01", "2026-11-03"]);
  assert.equal(isRepeatDate(rule, "2026-10-26"), false);
  assert.deepEqual(repeatDates(daily({ untilDate: "2026-10-28" }), "2026-10-28", "2026-10-28"), ["2026-10-28"]);
});
test("weekly Monday-based intervals respect a midweek start without inventing past occurrences", () => {
  const rule = { ...daily(), frequency: "weekly", interval: 2, weekdays: [1, 3, 7] };
  assert.deepEqual(repeatDates(rule, "2026-10-26", "2026-11-15"), ["2026-10-28", "2026-11-01", "2026-11-09", "2026-11-11", "2026-11-15"]);
  assert.equal(isoWeekday("0001-01-01"), 1); assert.equal(isoWeekday("1970-01-01"), 4); assert.equal(isoWeekday("2026-11-01"), 7);
});
test("monthly day31 skips short months instead of shifting to month end", () => {
  const rule = { ...daily({ startDate: "2026-01-31" }), frequency: "monthly", monthDay: 31 };
  assert.deepEqual(repeatDates(rule, "2026-01-01", "2026-06-30"), ["2026-01-31", "2026-03-31", "2026-05-31"]);
  assert.equal(isRepeatDate(rule, "2026-02-28"), false);
  assert.equal(isRepeatDate({ ...rule, interval: 2 }, "2026-08-31"), false);
});
test("leap days, century rules and year transitions use calendar dates independently of host timezone", () => {
  const rule = { ...daily({ startDate: "2028-01-29" }), frequency: "monthly", monthDay: 29 };
  assert.equal(isRepeatDate(rule, "2028-02-29"), true);
  assert.equal(isRepeatDate({ ...rule, startDate: "2100-01-29" }, "2100-02-28"), false);
  assert.deepEqual(repeatDates(daily({ startDate: "2026-12-30", interval: 2 }), "2026-12-30", "2027-01-03"), ["2026-12-30", "2027-01-01", "2027-01-03"]);
});
test("invalid or ambiguous rules and oversized ranges fail explicitly without partial generation", () => {
  for (const bad of [daily({ interval: 0 }), daily({ interval: 1.5 }), daily({ interval: 366 }), daily({ startDate: "2026-02-30" }), daily({ untilDate: "2026-10-27" }), daily({ untilDate: undefined }), daily({ weekdays: [1] }), daily({ frequency: "yearly" }), { ...daily(), frequency: "weekly", weekdays: [] }, { ...daily(), frequency: "weekly", weekdays: [0, 1] }, { ...daily(), frequency: "weekly", weekdays: [1, 1] }, { ...daily(), frequency: "monthly", monthDay: 32 }]) {
    assert.equal(validRepeatRule(bad), false); assert.throws(() => repeatDates(bad, "2026-10-28", "2026-10-29"));
  }
  assert.throws(() => repeatDates(daily(), "2026-10-29", "2026-10-28"));
  assert.throws(() => repeatDates(daily(), "2028-01-01", "2029-01-01"), /366/);
  assert.equal(repeatDates(daily({ startDate: "2028-01-01" }), "2028-01-01", "2028-12-31").length, 366);
});
test("occurrence identity is deterministic and distinct per original date and series", () => {
  const first = repeatOccurrenceId("series-1", "2026-10-28");
  assert.equal(first, repeatOccurrenceId("series-1", "2026-10-28"));
  assert.notEqual(first, repeatOccurrenceId("series-2", "2026-10-28"));
  assert.notEqual(first, repeatOccurrenceId("series-1", "2026-10-29"));
  for (const [id, date] of [["", "2026-10-28"], ["x:2026-10-28", "2026-10-28"], ["x".repeat(61), "2026-10-28"], ["series-1", "2026-02-30"]]) assert.throws(() => repeatOccurrenceId(id, date));
});
