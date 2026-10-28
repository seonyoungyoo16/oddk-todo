import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { loadPlan } from "../supabase/functions/_shared/plan-migration.ts";
import { createRecurrence, materializeRecurrences, editRepeatOccurrence, updateRecurrence, stopRecurrence } from "../supabase/functions/_shared/repeat-actions.ts";
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
  const original = await api({ action: "pull" }), other = await api({ action: "pull" }, 200, 1);
  const loaded = loadPlan(JSON.stringify(original.plan)); assert.equal(loaded.ok, true);
  const baseline = loaded.plan, source = { id: "qa-repeat", title: "UX10 isolated routine", notes: "Private test fixture", plannedDate: "2026-10-28", startTime: "23:30", minutes: 60, bufferMinutes: 10, endTime: "00:30", endDate: "2026-10-29", endDayOffset: 1, priority: "high", done: false };
  const seeded = { ...baseline, tasks: [...baseline.tasks, source], goalTree: { ...baseline.goalTree, groups: baseline.goalTree.groups.map((group, index) => index ? group : { ...group, taskIds: [...group.taskIds, source.id] }) } };
  // Bound this sync/CAS fixture to its materialized window so the live Cron
  // does not extend it mid-assertion. Unbounded app-closed generation has a
  // separate maintenance fixture and real server/DB acceptance evidence.
  const range = { from: "2026-10-28", through: "2026-11-04" }, rule = { frequency: "daily", interval: 1, startDate: range.from, untilDate: range.through };
  const created = createRecurrence(seeded, source.id, "qa-series", rule, range);
  let saved = await api({ action: "push", plan: created, version: original.version });
  let pulled = await api({ action: "pull" }); assert.deepEqual(pulled.plan, created); assert.equal(pulled.plan.schemaVersion, 6);
  const at = (p, date) => p.tasks.find(t => t.repeatSeriesId === "qa-series" && t.repeatDate === date);
  assert.equal(at(pulled.plan, "2026-10-29").id, "repeat:qa-series:2026-10-29");
  assert.equal(at(pulled.plan, "2026-10-29").endDate, "2026-10-30"); assert.equal(at(pulled.plan, "2026-10-29").bufferMinutes, 10);
  for (const version of [1, 2, 3, 4, 5]) {
    let old;
    if (version === 1) old = { tasks: [], start: "09:00" };
    else old = { ...baseline, schemaVersion: version, tasks: [], goalTree: { goal: "Old", groups: [] } };
    await api({ action: "push", plan: old, version: saved.version }, 426);
    assert.deepEqual(await api({ action: "pull" }), pulled);
  }
  const invalid = { ...created, tasks: created.tasks.map(t => t.id === source.id ? { ...t, repeatSeriesId: "missing" } : t) };
  await api({ action: "push", plan: invalid, version: saved.version }, 400); assert.deepEqual(await api({ action: "pull" }), pulled);
  await api({ action: "push", plan: created, version: original.version }, 409); assert.deepEqual(await api({ action: "pull" }), pulled);
  const moved = editRepeatOccurrence(created, { ...at(created, "2026-10-29"), plannedDate: "2026-11-10", endDate: "2026-11-11", title: "Only this", reminderMinutes: 0 });
  saved = await api({ action: "push", plan: moved, version: saved.version });
  pulled = await api({ action: "pull" }); assert.deepEqual(pulled.plan, moved); assert.equal(at(pulled.plan, "2026-10-29").reminderMinutes, 0);
  let next = stopRecurrence(moved, "qa-series", "2026-10-30", "this");
  next = { ...next, tasks: next.tasks.map(t => t.repeatDate === "2026-10-31" && t.repeatSeriesId === "qa-series" ? { ...t, done: true } : t) };
  next = materializeRecurrences(next, range); assert.equal(at(next, "2026-10-30"), undefined);
  saved = await api({ action: "push", plan: next, version: saved.version }); assert.deepEqual((await api({ action: "pull" })).plan, next);
  const completed = at(next, "2026-10-31"), exception = at(next, "2026-10-29"), previous = at(next, range.from);
  next = updateRecurrence(next, "qa-series", "2026-10-29", "future", { ...rule, startDate: "2026-10-29", interval: 2 }, { ...next.recurrences[0].segments[0].template, title: "Future routine", reminderMinutes: 10 }, range);
  assert.deepEqual(at(next, "2026-10-31"), completed); assert.deepEqual(at(next, "2026-10-29"), exception); assert.deepEqual(at(next, range.from), previous);
  saved = await api({ action: "push", plan: next, version: saved.version }); assert.deepEqual((await api({ action: "pull" })).plan, next);
  next = stopRecurrence(next, "qa-series", range.from, "all");
  assert.deepEqual(next.tasks.filter(t => t.repeatSeriesId === "qa-series"), [completed]);
  saved = await api({ action: "push", plan: next, version: saved.version }); assert.deepEqual((await api({ action: "pull" })).plan, next);
  assert.deepEqual(await api({ action: "pull" }, 200, 1), other);
  const restored = applyUndo(next, makeUndo(baseline, next, "Undo all recurrence fixture"));
  assert.deepEqual(restored, { ...baseline, schemaVersion: 6 });
  saved = await api({ action: "push", plan: restored, version: saved.version }); assert.deepEqual((await api({ action: "pull" })).plan, restored);
  console.log("PASS: V6 stable repeat IDs/midnight/buffer/goals/reminders JSONB roundtrip; V1-V5 writes426 and invalid400/stale409 preserve full state; date exception/skip/future edits/completed history/stop/undo; account isolation");
} finally { await Promise.all(clients.map(client => client.auth.signOut())); }
