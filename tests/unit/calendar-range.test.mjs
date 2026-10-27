import test from "node:test";
import assert from "node:assert/strict";
import { shiftDate, weekDates, selectRangeTasks, dayLabel } from "../../app/todo/calendar-range.ts";
test("Monday through Sunday ranges span month/year boundaries without host-timezone dependence", () => {
  assert.deepEqual(weekDates("2026-10-28"), ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"]);
  assert.deepEqual(weekDates("2027-01-01"), ["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03"]);
  assert.equal(shiftDate("2024-02-28", 1), "2024-02-29"); assert.equal(shiftDate("2026-02-28", 1), "2026-03-01");
});
test("supported calendar boundaries and invalid dates never create malformed dates", () => {
  assert.equal(shiftDate("0001-01-01", -1), null); assert.equal(shiftDate("9999-12-31", 1), null);
  assert.equal(weekDates("0001-01-01")[0], "0001-01-01"); assert.equal(weekDates("9999-12-31").at(-1), "9999-12-31");
  assert.deepEqual(weekDates("2026-02-30"), []); assert.equal(shiftDate("", 1), null); assert.equal(shiftDate("2026-10-28", 1.5), null);
});
test("day/week/all filters share task identities and do not silently assign undated tasks", () => {
  const tasks = [{ id: "a", plannedDate: "2026-10-28" }, { id: "b", plannedDate: "2026-10-29" }, { id: "c", plannedDate: null }, { id: "d", plannedDate: "2026-11-02" }];
  assert.deepEqual(selectRangeTasks(tasks, "2026-10-28", "day").map(t => t.id), ["a"]);
  assert.deepEqual(selectRangeTasks(tasks, "2026-10-28", "week").map(t => t.id), ["a", "b"]);
  assert.deepEqual(selectRangeTasks(tasks, "", "all"), tasks); assert.deepEqual(selectRangeTasks(tasks, "", "day"), []);
  assert.equal(tasks[2].plannedDate, null); assert.match(dayLabel("2026-10-28"), /수/);
});
