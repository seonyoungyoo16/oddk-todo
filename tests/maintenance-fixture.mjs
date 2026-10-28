// Admin drives SQL/cron separately; this client has only normal test-user access.
// No OAuth or real user's browser data/permissions are used.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { addCalendarDays } from "../supabase/functions/_shared/calendar.ts";
import { createRecurrence, editRepeatOccurrence, stopRecurrence } from "../supabase/functions/_shared/repeat-actions.ts";
import { prepareRepeatWindow } from "../supabase/functions/_shared/repeat-window.ts";
const url = "https://synxmskamifpovuziecx.supabase.co", key = "sb_publishable_ACwZjSLbL_dU9hilmAV7CQ_FEH8AT29";
const users = JSON.parse(readFileSync(new URL("../.sync-auth-fixture.json", import.meta.url), "utf8"));
assert.equal(users.length, 2); assert.ok(users.every(u => u.email.endsWith("@example.invalid") && u.marker.startsWith("oddk-verification-")));
const clients = users.map(() => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }));
const evidencePath = new URL("../.sync-test-runtime/maintenance-fixture.json", import.meta.url);
const sessions = await Promise.all(clients.map(async (client, i) => { const { data, error } = await client.auth.signInWithPassword(users[i]); assert.equal(error, null); return data.session; }));
async function api(body, account = 0) {
  const response = await fetch(`${url}/functions/v1/plan-sync`, { method: "POST", headers: { Authorization: `Bearer ${sessions[account].access_token}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json(); assert.equal(response.status, 200, data.error); return data;
}
try {
  if (process.argv[2] === "prepare") {
    const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10), before = addCalendarDays(today, -2), second = addCalendarDays(today, -1), tomorrow = addCalendarDays(today, 1);
    const empty = { schemaVersion: 5, start: "09:00", tasks: [], reviewsByDate: {}, goalTree: { goal: "Maintenance QA", groups: [{ id: "g", title: "Goal", taskIds: [] }] } };
    const first = await api({ action: "ensure", plan: empty });
    const other = await api({ action: "ensure", plan: empty }, 1);
    const task = { id: "maintenance-source", title: "Server routine", notes: "Preserve private test note", plannedDate: before, startTime: "09:00", minutes: 60, bufferMinutes: 10, endTime: "10:00", endDate: before, endDayOffset: 0, priority: "high", done: false };
    let next = createRecurrence({ ...empty, tasks: [task], goalTree: { ...empty.goalTree, groups: [{ ...empty.goalTree.groups[0], taskIds: [task.id] }] } }, task.id, "maintenance-series", { frequency: "daily", interval: 1, startDate: before, untilDate: null }, { from: before, through: second });
    next.recurrences[0].segments[0].template.reminderMinutes = 10;
    next.tasks = next.tasks.map(t => ({ ...t, reminderMinutes: 10 }));
    next.tasks[0].done = true;
    next = editRepeatOccurrence(next, { ...next.tasks[1], title: "Manual exception", plannedDate: tomorrow, endDate: tomorrow });
    next = stopRecurrence(next, "maintenance-series", addCalendarDays(today, 2), "this");
    const saved = await api({ action: "push", plan: next, version: first.version });
    const expected = prepareRepeatWindow(next, today);
    writeFileSync(evidencePath, JSON.stringify({ user: users[0].id, today, before: { plan: next, version: saved.version }, expected, other, firstVerified: false }), { mode: 0o600 });
    assert.equal(next.tasks.length, 2); assert.equal(expected.tasks.length, 32);
    console.log("PASS: isolated recurring account prepared with 2 past occurrences, completed history, moved exception, skip and goal links; second account remains V5. No app client prepares the window.");
  } else if (["verify", "verify-noop"].includes(process.argv[2])) {
    const evidence = JSON.parse(readFileSync(evidencePath, "utf8")); assert.equal(evidence.user, users[0].id);
    const actual = await api({ action: "pull" }), other = await api({ action: "pull" }, 1);
    assert.deepEqual(actual.plan, evidence.expected); assert.equal(actual.version, evidence.before.version + 1); assert.deepEqual(other, evidence.other);
    assert.equal(new Set(actual.plan.tasks.map(t => t.id)).size, 32);
    if (process.argv[2] === "verify-noop") { assert.equal(evidence.firstVerified, true); assert.deepEqual(actual, evidence.after); }
    else {
      assert.equal(evidence.firstVerified, false); evidence.firstVerified = true; evidence.after = actual;
      writeFileSync(evidencePath, JSON.stringify(evidence), { mode: 0o600 });
    }
    const protectedRpc = [
      ["task_maintenance_claim", { p_hash: "0".repeat(64) }], ["task_maintenance_batch", { p_lease: crypto.randomUUID() }],
      ["task_maintenance_write", { p_lease: crypto.randomUUID(), p_user: users[0].id, p_version: actual.version, p_plan: actual.plan }],
      ["task_maintenance_finish", { p_lease: crypto.randomUUID(), p_cursor: null, p_result: {} }], ["task_maintenance_dispatch", {}],
    ];
    for (const client of clients) {
      for (const [name, args] of protectedRpc) { const { error } = await client.rpc(name, args); assert.equal(error?.code, "42501", name); }
      assert.equal((await client.from("task_maintenance_state").select("singleton")).error?.code, "42501");
    }
    for (const session of [null, sessions[0], sessions[1]]) {
      const response = await fetch(`${url}/rest/v1/http_request_queue?select=id`, { headers: { apikey: key, "Accept-Profile": "net", ...(session ? { authorization: `Bearer ${session.access_token}` } : {}) } });
      assert.equal(response.status, 406); assert.equal((await response.json()).code, "PGRST106");
    }
    console.log(`PASS: ${process.argv[2]} exact 32-occurrence server plan/goal/history/exception/skip/reminder roundtrip; version increments once only; V5 account unchanged; both accounts denied all scheduler RPCs/state; anon/auth net schema denied406.`);
  } else throw new Error("Use prepare, verify or verify-noop; admin dispatch is separate.");
} finally { await Promise.all(clients.map(client => client.auth.signOut())); }
