import test from "node:test";
import assert from "node:assert/strict";
import { koreanToday } from "../../app/todo/plan-date.ts";
test("today uses Seoul at UTC/day/year boundaries independently of host timezone", () => {
  for (const [instant, expected] of [
    ["2026-10-26T14:59:59Z", "2026-10-26"],
    ["2026-10-26T15:00:00Z", "2026-10-27"],
    ["2026-12-31T15:00:00Z", "2027-01-01"],
    ["2024-02-28T15:00:00Z", "2024-02-29"],
  ]) assert.equal(koreanToday(new Date(instant)), expected);
});
