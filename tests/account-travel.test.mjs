import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { loadPlan } from "../supabase/functions/_shared/plan-migration.ts";
import { createTravelPreview, applyTravelPreview } from "../app/todo/travel-core.ts";
import { makeUndo, applyUndo } from "../app/todo/plan-history.ts";
const url = "https://synxmskamifpovuziecx.supabase.co", key = "sb_publishable_ACwZjSLbL_dU9hilmAV7CQ_FEH8AT29";
const users = JSON.parse(readFileSync(new URL("../.sync-auth-fixture.json", import.meta.url), "utf8"));
const clients = users.map(() => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }));
const sessions = await Promise.all(clients.map(async (client, index) => { const { data, error } = await client.auth.signInWithPassword({ email: users[index].email, password: users[index].password }); assert.equal(error, null); return data.session; }));
async function api(body, expected = 200, account = 0) {
  const response = await fetch(`${url}/functions/v1/${process.env.ODDK_TEST_EDGE_FUNCTION ?? "plan-sync"}`, { method: "POST", headers: { Authorization: `Bearer ${sessions[account].access_token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json(); assert.equal(response.status, expected, data.error); return data;
}
try {
  const original = await api({ action: "pull" }), otherBefore = await api({ action: "pull" }, 200, 1);
  const loaded = loadPlan(JSON.stringify(original.plan)); assert.equal(loaded.ok, true);
  let saved = await api({ action: "push", plan: loaded.plan, version: original.version });
  const baseline = saved.plan;
  // Manual fallback is intentional here: live provider lookup is a separate test.
  const draft = { id: "qa-trip-one", date: "2026-10-28", departure: "23:50", mode: "foot", buffer: "10", stops: [{ id: "from", query: "UX08 QA origin", place: null, stay: "", manualTravel: "" }, { id: "to", query: "UX08 QA destination", place: null, stay: "30", manualTravel: "15" }], result: null };
  const preview = createTravelPreview(draft), withTrip = applyTravelPreview(baseline, preview, draft);
  saved = await api({ action: "push", plan: withTrip, version: saved.version });
  const pulled = await api({ action: "pull" }); assert.deepEqual(pulled.plan, withTrip);
  const travel = pulled.plan.tasks.find(task => task.id === preview.tasks[0].id), visit = pulled.plan.tasks.find(task => task.id === preview.tasks[1].id);
  assert.equal(travel.startTime, "23:50"); assert.equal(travel.endTime, "00:15"); assert.equal(travel.endDate, "2026-10-29"); assert.equal(travel.minutes, 25); assert.equal(travel.bufferMinutes, 10); assert.match(travel.notes, /사용자 직접 입력/);
  assert.equal(visit.plannedDate, "2026-10-29"); assert.equal(visit.startTime, "00:15"); assert.equal(visit.minutes, 30);
  assert.deepEqual(pulled.plan.goalTree, baseline.goalTree); assert.deepEqual(pulled.plan.mandala, baseline.mandala);
  assert.throws(() => applyTravelPreview(pulled.plan, preview, draft), /이미 반영/);
  const invalid = { ...withTrip, tasks: withTrip.tasks.map(task => task.id === travel.id ? { ...task, bufferMinutes: task.minutes } : task) };
  await api({ action: "push", plan: invalid, version: saved.version }, 400); assert.deepEqual(await api({ action: "pull" }), pulled);
  await api({ action: "push", plan: baseline, version: original.version }, 409); assert.deepEqual(await api({ action: "pull" }), pulled);
  assert.deepEqual(await api({ action: "pull" }, 200, 1), otherBefore);
  const nextDraft = { ...draft, id: "qa-trip-two", date: "2026-10-30" }, nextPreview = createTravelPreview(nextDraft);
  const both = applyTravelPreview(withTrip, nextPreview, nextDraft);
  saved = await api({ action: "push", plan: both, version: saved.version }); assert.deepEqual(saved.plan, both);
  const completed = { ...both, tasks: both.tasks.map(task => task.id === travel.id ? { ...task, done: true } : task) }, completeUndo = makeUndo(both, completed, "Complete travel");
  saved = await api({ action: "push", plan: completed, version: saved.version });
  saved = await api({ action: "push", plan: applyUndo(saved.plan, completeUndo), version: saved.version }); assert.deepEqual(saved.plan, both);
  const secondUndo = makeUndo(withTrip, both, "Add another date"), firstUndo = makeUndo(baseline, withTrip, "Add first trip");
  saved = await api({ action: "push", plan: applyUndo(saved.plan, secondUndo), version: saved.version }); assert.deepEqual(saved.plan, withTrip);
  saved = await api({ action: "push", plan: applyUndo(saved.plan, firstUndo), version: saved.version }); assert.deepEqual(saved.plan, baseline);
  console.log("PASS: travel/visit V5 JSON and midnight/buffer/manual provenance roundtrip, duplicate prevention, invalid400 and stale409 unchanged, account isolation, same-route different-date completion undo and complete trip rollback preserve existing goals/tasks");
} finally { await Promise.all(clients.map(client => client.auth.signOut())); }
