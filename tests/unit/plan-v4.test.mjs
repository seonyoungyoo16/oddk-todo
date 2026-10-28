import test from "node:test";
import assert from "node:assert/strict";
import { validPlan } from "../../supabase/functions/_shared/plan.ts";
import { loadPlan, taskToV4, upgradeStoredPlan } from "../../supabase/functions/_shared/plan-migration.ts";
import { makeUndo, applyUndo } from "../../app/todo/plan-history.ts";
const task = (id, patch = {}) => ({ id, title: id, notes: "old\nnote", plannedDate: "2026-10-28", minutes: 60, bufferMinutes: 10, startTime: "23:30", done: false, priority: "high", ...patch });
const v3 = () => ({ schemaVersion: 3, start: "09:00", tasks: [task("dated"), task("floating", { plannedDate: null }), task("duration", { startTime: null }), task("untimed", { minutes: null, bufferMinutes: null, startTime: null })], reviewsByDate: { "2026-10-28": "saved" }, mandala: { goal: "Keep", areas: Array.from({ length: 8 }, (_, index) => ({ title: String(index), taskIds: [index === 0 ? "dated" : "", ...Array(7).fill("")] })) } });
const memory = raw => { const map = new Map([["plan", raw], ["plan.before-v3", "keep old backup"]]); return { map, getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) }; };
test("V3 migration keeps dated, floating, duration-only and untimed tasks and all previous content", () => {
  const before = v3(); before.tasks[0].extension = { future: "preserve" };
  const loaded = loadPlan(JSON.stringify(before)); assert.equal(loaded.ok, true); assert.equal(loaded.migrated, true); assert.equal(loaded.plan.schemaVersion, 5);
  assert.deepEqual(loaded.plan.mandala, before.mandala); assert.deepEqual(loaded.plan.reviewsByDate, before.reviewsByDate);
  loaded.plan.tasks.forEach((t, i) => { for (const key of Object.keys(before.tasks[i])) assert.deepEqual(t[key], before.tasks[i][key]); });
  assert.deepEqual(loaded.plan.tasks.map(t => [t.endTime, t.endDate, t.endDayOffset]), [["00:30", "2026-10-29", 1], ["00:30", null, 1], [null, null, null], [null, null, null]]);
  assert.equal(loadPlan(JSON.stringify(loaded.plan)).migrated, false);
});
test("V4 migration backs up V3 without overwriting older backups and leaves impossible years intact", () => {
  const raw = JSON.stringify(v3()), storage = memory(raw); upgradeStoredPlan(storage, "plan");
  assert.equal(storage.getItem("plan.before-v4"), raw); assert.equal(storage.getItem("plan.before-v3"), "keep old backup");
  const saved = storage.getItem("plan"); upgradeStoredPlan(storage, "plan"); assert.equal(storage.getItem("plan"), saved);
  const broken = memory(raw), originalSet = broken.setItem; broken.setItem = (key, value) => { if (key === "plan.before-v4") throw Error("quota"); originalSet(key, value); };
  assert.throws(() => upgradeStoredPlan(broken, "plan")); assert.equal(broken.getItem("plan"), raw);
  const impossible = { ...v3(), tasks: [task("last", { plannedDate: "9999-12-31" })] }, impossibleRaw = JSON.stringify(impossible), guarded = memory(impossibleRaw);
  assert.equal(upgradeStoredPlan(guarded, "plan").ok, false); assert.equal(guarded.getItem("plan"), impossibleRaw); assert.equal(guarded.getItem("plan.before-v4"), null);
});
test("V4 ends are mandatory and must agree with dates, explicit offset and persisted total", () => {
  const plan = loadPlan(JSON.stringify(v3())).plan; assert.equal(validPlan(plan), true);
  for (const patch of [{ endTime: undefined }, { endTime: "24:00" }, { endTime: "00:31" }, { endDate: null }, { endDate: "2026-10-28" }, { endDate: "2026-02-30" }, { endDayOffset: undefined }, { endDayOffset: 0 }, { endDayOffset: 2 }, { minutes: 61 }, { bufferMinutes: 60 }]) assert.equal(validPlan({ ...plan, tasks: [{ ...plan.tasks[0], ...patch }] }), false, JSON.stringify(patch));
  assert.equal(validPlan({ ...plan, tasks: [{ ...plan.tasks[3], endTime: "10:00" }] }), false);
  const old = v3(); assert.equal(validPlan(old), true);
  assert.equal(validPlan({ ...old, schemaVersion: "3" }), false); assert.equal(validPlan({ ...old, schemaVersion: Symbol("3") }), false);
});
test("availability is date-scoped with strict times, fixed block IDs and bounds", () => {
  const plan = loadPlan(JSON.stringify(v3())).plan;
  const availability = { start: "09:00", end: "24:00", fixed: [{ id: "break", title: "Lunch", start: "12:00", end: "13:00" }] };
  assert.equal(validPlan({ ...plan, availabilityByDate: { "2026-10-28": availability } }), true);
  for (const value of [{ start: "18:00", end: "09:00", fixed: [] }, { ...availability, start: "24:00" }, { ...availability, fixed: [...availability.fixed, ...availability.fixed] }, { ...availability, fixed: [{ ...availability.fixed[0], end: "11:00" }] }, { ...availability, fixed: [{ ...availability.fixed[0], title: " " }] }, { ...availability, fixed: Array.from({ length: 31 }, (_, i) => ({ ...availability.fixed[0], id: String(i) })) }]) assert.equal(validPlan({ ...plan, availabilityByDate: { "2026-10-28": value } }), false);
  assert.equal(validPlan({ ...plan, availabilityByDate: { "2026-02-30": availability } }), false);
});
test("V3 undo records survive migration while newer notes and endpoints remain protected", () => {
  const before = v3(), after = { ...before, tasks: before.tasks.map(t => ({ ...t, done: true })) };
  const oldUndo = JSON.parse(JSON.stringify(makeUndo(before, after, "Old completion")));
  const migratedAfter = loadPlan(JSON.stringify(after)).plan, migratedBefore = loadPlan(JSON.stringify(before)).plan;
  assert.deepEqual(applyUndo(migratedAfter, oldUndo), migratedBefore);
  const changed = { ...migratedAfter, tasks: migratedAfter.tasks.map(t => t.id === "dated" ? { ...t, startTime: "23:20", endTime: "00:20" } : t) };
  assert.equal(validPlan(changed), true); assert.throws(() => applyUndo(changed, oldUndo), /이후에 변경/);
  assert.deepEqual(taskToV4(before.tasks[0]), migratedBefore.tasks[0]);
  const deleted = { ...before, tasks: before.tasks.slice(1), mandala: { ...before.mandala, areas: before.mandala.areas.map(a => ({ ...a, taskIds: a.taskIds.map(() => "") })) } };
  assert.deepEqual(applyUndo(loadPlan(JSON.stringify(deleted)).plan, makeUndo(before, deleted, "Old deletion")), migratedBefore);
});
