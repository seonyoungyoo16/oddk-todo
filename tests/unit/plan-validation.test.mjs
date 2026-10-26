import test from "node:test";
import assert from "node:assert/strict";
import { validPlan, hasTaskTime } from "../../supabase/functions/_shared/plan.ts";
import { validPlan as edgeValidPlan } from "../../supabase/functions/plan-sync/validate.ts";
import { parseTaskTimeDraft, workFromStoredTime } from "../../app/todo/task-time.ts";

const task = () => ({ id: "synthetic-1", title: "Synthetic task", minutes: null, bufferMinutes: null, startTime: null, priority: "normal", done: false });
const plan = (changes = {}) => ({ tasks: [{ ...task(), ...changes }], start: "09:00" });

test("browser and Edge adapter accept the same valid plans", () => {
  for (const value of [plan(), plan({ minutes: 30, bufferMinutes: 5, startTime: "23:59" }), plan({ minutes: 240, bufferMinutes: 1 })]) {
    assert.equal(validPlan(value), true);
    assert.equal(edgeValidPlan(value), true);
  }
  const draft = parseTaskTimeDraft(workFromStoredTime(30, 5), "5");
  assert.equal(draft.minutes, 30);
  assert.equal(draft.bufferMinutes, 5);
});

test("contradictory, partial and nonintegral persisted durations are rejected", () => {
  for (const [minutes, bufferMinutes] of [[25, 30], [25, 25], [30, null], [null, 5], [0, 1], [-5, 1], [30, 0], [30, -1], [30.5, 5], [30, 5.5], [241, 1], ["30", 5], [undefined, undefined]]) {
    const value = plan({ minutes, bufferMinutes });
    assert.equal(validPlan(value), false, JSON.stringify([minutes, bufferMinutes]));
    assert.equal(edgeValidPlan(value), false);
    assert.equal(hasTaskTime(value.tasks[0]), false);
  }
});

test("a start requires a valid duration and strict HH:mm", () => {
  assert.equal(validPlan(plan({ startTime: "09:00" })), false);
  for (const startTime of ["24:00", "9:00", "12:60", "", 900, false]) {
    assert.equal(validPlan(plan({ minutes: 30, bufferMinutes: 5, startTime })), false);
  }
});

test("task limits, duplicate IDs and priority are preserved", () => {
  for (const changes of [{ title: " " }, { title: "x".repeat(121) }, { id: "" }, { priority: "urgent" }, { done: 1 }]) assert.equal(validPlan(plan(changes)), false);
  const duplicate = plan(); duplicate.tasks.push(task()); assert.equal(validPlan(duplicate), false);
  assert.equal(validPlan({ tasks: Array.from({ length: 5001 }, (_, i) => ({ ...task(), id: String(i) })), start: "09:00" }), false);
  assert.equal(validPlan({ ...plan(), start: "24:00" }), false);
  assert.equal(validPlan({ ...plan(), review: "x".repeat(2001) }), false);
  for (const value of [null, [], { ...plan(), tasks: [null] }]) assert.equal(validPlan(value), false);
});

test("mandala shape and string limits remain enforced", () => {
  const value = plan();
  value.mandala = { goal: "Synthetic goal", areas: Array.from({ length: 8 }, () => ({ title: "Area", taskIds: Array(8).fill("") })) };
  assert.equal(validPlan(value), true);
  for (const mutate of [
    (m) => { m.goal = "x".repeat(101); },
    (m) => { m.areas.pop(); },
    (m) => { m.areas[0].title = "x".repeat(61); },
    (m) => { m.areas[0].taskIds.pop(); },
    (m) => { m.areas[0].taskIds[0] = "x".repeat(101); },
    (m) => { m.areas[0].taskIds[0] = 1; },
  ]) {
    const invalid = structuredClone(value); mutate(invalid.mandala);
    assert.equal(validPlan(invalid), false);
  }
});
