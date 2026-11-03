import test from "node:test";
import assert from "node:assert/strict";
import { parsePlanBackup, summarizePlanBackup, MAX_PLAN_BACKUP_BYTES } from "../../app/todo/plan-backup.ts";

test("raw legacy exports migrate while goal links, category data, tags and schedule references survive preview parsing", () => {
  const plan = { start: "09:00", tasks: [{ id: "kept", title: "기존 할 일", minutes: 30, bufferMinutes: 5, startTime: null, priority: "normal", done: false }], review: "보존" };
  const original = JSON.stringify(plan), parsed = parsePlanBackup(original);
  assert.equal(parsed.schemaVersion, 5); assert.equal(parsed.tasks[0].id, "kept");
  assert.equal(parsed.review, "보존"); assert.equal(JSON.stringify(plan), original);
  const withExtras = { ...parsed, categories: [{ id: "cat", name: "보존할 분류", color: "#123456" }], tags: [{ id: "tag", name: "태그" }], tasks: [{ ...parsed.tasks[0], categoryId: "cat", tagIds: ["tag"], plannedDate: "2026-11-04" }], availabilityByDate: { "2026-11-05": { start: "09:00", end: "18:00", fixed: [] } } };
  const restored = parsePlanBackup(JSON.stringify(withExtras));
  assert.deepEqual(restored, withExtras);
  assert.deepEqual(summarizePlanBackup(restored), { tasks: 1, goals: 0, dates: 2 });
  const linked = { ...withExtras, goalTree: { goal: "", groups: [{ id: "group", title: "세부 목표", taskIds: ["kept"] }] } };
  assert.deepEqual(parsePlanBackup(JSON.stringify(linked)).goalTree.groups[0].taskIds, ["kept"]);
  assert.equal(summarizePlanBackup(parsePlanBackup(JSON.stringify(linked))).goals, 1, "an unnamed board with linked goals still counts");
});

test("damaged, execution-only, future and oversized files cannot become replacement candidates", () => {
  for (const raw of ["not json", "null", "{}", JSON.stringify({ type: "oddk-executions", schemaVersion: 1, records: [] }), JSON.stringify({ schemaVersion: 99, tasks: [] })]) assert.throws(() => parsePlanBackup(raw));
  assert.throws(() => parsePlanBackup(" ".repeat(MAX_PLAN_BACKUP_BYTES + 1)), /10MB/);
});
