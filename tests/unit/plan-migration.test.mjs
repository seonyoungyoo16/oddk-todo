import test from "node:test";
import assert from "node:assert/strict";
import { loadPlan, upgradeStoredPlan } from "../../supabase/functions/_shared/plan-migration.ts";
import { validPlan, isPlanDate } from "../../supabase/functions/_shared/plan.ts";
import { goalTreeFromMandala } from "../../supabase/functions/_shared/goal-tree.ts";

const legacy = () => ({ tasks: [{ id: "synthetic", title: "Synthetic task", minutes: 60, bufferMinutes: 10, startTime: "23:30", priority: "high", done: true }], start: "09:00", review: "Undated review", mandala: { goal: "Goal", areas: Array.from({ length: 8 }, (_, i) => ({ title: String(i), taskIds: [i === 0 ? "synthetic" : "", ...Array(7).fill("")] })) } });
const memory = (raw) => {
  const entries = new Map([["plan", raw]]);
  return { entries, getItem: (key) => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
};

test("V1 migration preserves all existing values and references; V5 is idempotent", () => {
  const old = legacy(); const result = loadPlan(JSON.stringify(old));
  assert.equal(result.ok, true); assert.equal(result.migrated, true);
  assert.equal(result.plan.schemaVersion, 5);
  assert.deepEqual(result.plan.tasks, old.tasks.map((task) => ({ ...task, plannedDate: null, notes: "", endTime: "00:30", endDate: null, endDayOffset: 1 })));
  assert.deepEqual(result.plan.mandala, old.mandala);
  assert.equal(result.plan.review, old.review);
  assert.equal(result.plan.start, old.start);
  assert.deepEqual(result.plan.reviewsByDate, {});
  assert.equal(validPlan(result.plan), true);
  const again = loadPlan(JSON.stringify(result.plan));
  assert.equal(again.ok, true); assert.equal(again.migrated, false);
  assert.deepEqual(again.plan, result.plan);
  assert.equal(loadPlan(JSON.stringify({ tasks: [], start: "00:00" })).ok, true);
});
test("dates must exist on the calendar, including leap and century boundaries", () => {
  for (const date of ["2026-02-28", "2024-02-29", "2000-02-29", "0001-01-01"]) assert.equal(isPlanDate(date), true);
  for (const date of ["2026-02-30", "2026-02-29", "1900-02-29", "2026-13-01", "2026-01-00", "0000-01-01", "2026-1-1", 20261027, null]) assert.equal(isPlanDate(date), false);
  const { plan } = loadPlan(JSON.stringify(legacy()));
  for (const plannedDate of ["2026-02-30", 1, undefined]) {
    const invalid = structuredClone(plan); invalid.tasks[0].plannedDate = plannedDate;
    assert.equal(loadPlan(JSON.stringify(invalid)).ok, false);
  }
  plan.reviewsByDate["2026-02-30"] = "invalid";
  assert.equal(validPlan(plan), false);
});
test("corrupt JSON, missing required fields and future versions never overwrite raw storage", () => {
  for (const raw of ["{", JSON.stringify({ tasks: [] }), JSON.stringify({ ...legacy(), schemaVersion: 99 })]) {
    const storage = memory(raw); const result = upgradeStoredPlan(storage, "plan");
    assert.equal(result.ok, false); assert.equal(storage.getItem("plan"), raw);
    assert.equal(storage.entries.size, 1);
  }
});
test("backup precedes replacement and storage failures preserve the original", () => {
  const raw = JSON.stringify(legacy()); const storage = memory(raw);
  const result = upgradeStoredPlan(storage, "plan");
  assert.equal(result.ok, true); assert.equal(storage.getItem("plan.before-v2"), raw);
  assert.equal(loadPlan(storage.getItem("plan")).migrated, false);
  const saved = storage.getItem("plan"); upgradeStoredPlan(storage, "plan");
  assert.equal(storage.getItem("plan"), saved); assert.equal(storage.getItem("plan.before-v2"), raw);
  for (const failAt of ["plan.before-v2", "plan.before-v3", "plan.before-v4", "plan.before-v5", "plan"]) {
    const broken = memory(raw); const set = broken.setItem;
    broken.setItem = (key, value) => { if (key === failAt) throw new Error("quota"); set(key, value); };
    assert.throws(() => upgradeStoredPlan(broken, "plan"));
    assert.equal(broken.getItem("plan"), raw);
    if (failAt === "plan") assert.equal(broken.getItem("plan.before-v2"), raw);
  }
});

test("V2 to V5 adds notes, explicit ends and goal tree while preserving all dated source data", () => {
  const v2 = { ...legacy(), schemaVersion: 2, tasks: legacy().tasks.map(t => ({ ...t, plannedDate: "2026-10-28" })), reviewsByDate: { "2026-10-28": "Saved review" } };
  const raw = JSON.stringify(v2), storage = memory(raw);
  const loaded = upgradeStoredPlan(storage, "plan");
  assert.equal(loaded.ok, true); assert.equal(loaded.migrated, true);
  assert.deepEqual(loaded.plan, { ...v2, schemaVersion: 5, goalTree: goalTreeFromMandala(v2.mandala, v2.tasks), tasks: v2.tasks.map(t => ({ ...t, notes: "", endTime: "00:30", endDate: "2026-10-29", endDayOffset: 1 })) });
  assert.equal(storage.getItem("plan.before-v3"), raw);
  assert.equal(storage.getItem("plan.before-v4"), raw);
  assert.equal(storage.getItem("plan.before-v5"), raw);
  assert.equal(storage.getItem("plan.before-v2"), null);
  const again = upgradeStoredPlan(storage, "plan"); assert.equal(again.migrated, false);
  assert.equal(storage.getItem("plan.before-v3"), raw);
});

test("V3 notes preserve newlines and enforce the same bounds as the server contract", () => {
  const value = loadPlan(JSON.stringify(legacy())).plan;
  value.tasks[0].notes = "first\nsecond";
  assert.equal(validPlan(value), true); assert.deepEqual(loadPlan(JSON.stringify(value)).plan, value);
  for (const notes of [undefined, null, 3, "x".repeat(2001)]) assert.equal(validPlan({ ...value, tasks: [{ ...value.tasks[0], notes }] }), false);
  assert.equal(validPlan({ ...value, tasks: [{ ...value.tasks[0], notes: "x".repeat(2000) }] }), true);
});
