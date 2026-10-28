import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { makeUndo, applyUndo } from "../app/todo/plan-history.ts";
import { removeCategory, removeTag } from "../app/todo/classification-actions.ts";
const url = "https://synxmskamifpovuziecx.supabase.co", key = "sb_publishable_ACwZjSLbL_dU9hilmAV7CQ_FEH8AT29";
const [user] = JSON.parse(readFileSync(new URL("../.sync-auth-fixture.json", import.meta.url), "utf8"));
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: auth, error } = await client.auth.signInWithPassword({ email: user.email, password: user.password }); assert.equal(error, null);
async function api(body, expected = 200) {
  const r = await fetch(`${url}/functions/v1/${process.env.ODDK_TEST_EDGE_FUNCTION ?? "plan-sync"}`, { method: "POST", headers: { Authorization: `Bearer ${auth.session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const value = await r.json(); assert.equal(r.status, expected, value.error); return value;
}
try {
  const before = await api({ action: "pull" });
  const plan = { ...before.plan, categories: [{ id: "work", name: "업무", color: "#336699" }], tags: [{ id: "exercise", name: "운동" }, { id: "morning", name: "아침" }], tasks: before.plan.tasks.map(task => ({ ...task, categoryId: "work", tagIds: ["exercise", "morning"] })) };
  let saved = await api({ action: "push", plan, version: before.version }); const snapshot = await api({ action: "pull" }); assert.deepEqual(snapshot.plan, plan);
  for (const invalid of [{ ...plan, tasks: plan.tasks.map(t => ({ ...t, categoryId: "missing" })) }, { ...plan, tasks: plan.tasks.map(t => ({ ...t, tagIds: ["missing"] })) }, { ...plan, categories: [{ ...plan.categories[0], color: "red" }] }, { ...plan, categories: [...plan.categories, { id: "duplicate", name: "업무", color: "#123456" }] }, { ...plan, tags: Array.from({ length: 101 }, (_, i) => ({ id: String(i), name: String(i) })) }]) { await api({ action: "push", plan: invalid, version: saved.version }, 400); assert.deepEqual(await api({ action: "pull" }), snapshot); }
  const renamed = { ...plan, categories: [{ ...plan.categories[0], name: "업무 계획", color: "#884422" }] };
  saved = await api({ action: "push", plan: renamed, version: saved.version }); assert.deepEqual(saved.plan.tasks, plan.tasks);
  const untagged = removeTag(renamed, "exercise"), tagUndo = makeUndo(renamed, untagged, "Remove tag");
  saved = await api({ action: "push", plan: untagged, version: saved.version }); assert.deepEqual(applyUndo(saved.plan, tagUndo), renamed); assert.deepEqual(saved.plan.tasks[0].tagIds, ["morning"]);
  const unclassified = removeCategory(untagged, "work"), categoryUndo = makeUndo(untagged, unclassified, "Remove category");
  saved = await api({ action: "push", plan: unclassified, version: saved.version }); assert.equal(saved.plan.tasks[0].categoryId, null); assert.equal(saved.plan.tasks[0].id, plan.tasks[0].id); assert.equal(saved.plan.tasks[0].endTime, plan.tasks[0].endTime); assert.deepEqual(applyUndo(saved.plan, categoryUndo), untagged);
  await api({ action: "push", plan, version: before.version }, 409); assert.deepEqual((await api({ action: "pull" })).plan, unclassified);
  console.log("PASS: category/tag JSONB round trip, rename/color keeps IDs, missing refs/invalid definitions400 preserve snapshot, removal keeps tasks/time and undo refs, stale CAS409");
} finally { await client.auth.signOut(); }
