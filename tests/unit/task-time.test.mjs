import test from "node:test";
import assert from "node:assert/strict";
import {
  parseTaskTimeDraft,
  workFromStoredTime,
} from "../../app/todo/task-time.ts";

test("work 25 + buffer 5 persists as total 30, and reopens as work 25", () => {
  const draft = parseTaskTimeDraft("25", "5");
  assert.deepEqual(draft, { minutes: 30, bufferMinutes: 5, error: "" });
  assert.equal(workFromStoredTime(draft.minutes, draft.bufferMinutes), "25");
});
test("an existing total 60 with buffer 10 reopens without changing its duration", () => {
  assert.deepEqual(parseTaskTimeDraft(workFromStoredTime(60, 10), "10"), {
    minutes: 60,
    bufferMinutes: 10,
    error: "",
  });
});
test("empty time settings remain optional", () => {
  assert.deepEqual(parseTaskTimeDraft("", ""), {
    minutes: null,
    bufferMinutes: null,
    error: "",
  });
});
test("partially entered time cannot be saved as a configured duration", () => {
  for (const values of [
    ["25", ""],
    ["", "5"],
  ])
    assert.ok(parseTaskTimeDraft(...values).error);
});
test("zero, negative, fractional, and nonnumeric times are rejected", () => {
  for (const values of [
    ["0", "5"],
    ["25", "0"],
    ["-1", "5"],
    ["1.5", "5"],
    ["25", "1.5"],
    ["no", "5"],
  ]) {
    assert.ok(parseTaskTimeDraft(...values).error);
  }
});
test("the total, including buffer, may reach but not exceed 240 minutes", () => {
  assert.equal(parseTaskTimeDraft("239", "1").minutes, 240);
  assert.ok(parseTaskTimeDraft("240", "1").error);
});
