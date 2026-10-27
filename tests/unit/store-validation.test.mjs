import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { validPlan } from "../../supabase/functions/_shared/plan.ts";
import { loadPlan, upgradeStoredPlan } from "../../supabase/functions/_shared/plan-migration.ts";

test("invalid writes, local recovery and review backups preserve snapshots", () => {
  const values = new Map();
  let notifications = 0;
  const source = readFileSync(new URL("../../app/todo/sync-store.ts", import.meta.url), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  vm.runInNewContext(js, {
    exports,
    require: (name) => {
      if (name.includes("_shared/plan-migration")) return { loadPlan, upgradeStoredPlan };
      if (name.includes("_shared/plan")) return { validPlan };
      if (name === "./supabase-client") return { syncClient: () => { throw new Error("Offline test must not access auth/network"); } };
      throw new Error(`Unexpected dependency: ${name}`);
    },
    localStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) },
    window: { dispatchEvent: () => { notifications++; } }, Event, Error, Set, crypto,
  });
  const plan = { tasks: [], start: "09:00" };
  exports.writePlan(plan);
  const before = values.get("oddk.todo.v1");
  assert.equal(notifications, 1);
  assert.throws(() => exports.writePlan({ ...plan, tasks: [{ id: "x", title: "Synthetic", done: false, priority: "normal", minutes: 25, bufferMinutes: 30, startTime: null }] }));
  assert.equal(values.get("oddk.todo.v1"), before);
  assert.equal(notifications, 1);
  exports.writePlan({ ...plan, review: "Latest validated content" });
  const latest = values.get("oddk.todo.v1");
  values.set("oddk.todo.v1", "{");
  assert.throws(() => exports.writePlan(plan));
  assert.equal(values.get("oddk.todo.v1"), "{");
  exports.restoreLastValidPlan();
  assert.equal(values.get("oddk.todo.v1"), latest);
  assert.ok([...values.entries()].some(([key, raw]) => key.startsWith("oddk.todo.v1.recovery-original.") && raw === "{"));
  exports.backupReviewPlan({ ...plan, review: "Unchosen draft" });
  assert.equal(values.get("oddk.todo.v1"), latest);
  assert.equal(JSON.parse(values.get("oddk.todo.v1.backup")).review, "Unchosen draft");
  assert.ok([...values.keys()].some((key) => key.startsWith("oddk.todo.v1.review-backup.")));
});
