import test from "node:test";
import assert from "node:assert/strict";
import { handleMaintenance } from "../../supabase/functions/task-maintenance/handler.ts";
import { createRecurrence, editRepeatOccurrence, stopRecurrence, materializeRecurrences } from "../../supabase/functions/_shared/repeat-actions.ts";
import { validPlan } from "../../supabase/functions/_shared/plan.ts";

const leaseId = "00000000-0000-4000-8000-000000000010";
const userId = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ticket = "a".repeat(64), now = new Date("2026-10-28T15:00:00Z"); // Oct 29 in Korea.
const req = (body = { ticket }, headers = {}) => new Request("https://example.invalid", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
function plan() {
  const task = { id: "a", title: "Routine", notes: "Preserve", priority: "normal", done: false, plannedDate: "2026-10-28", startTime: "09:00", minutes: 60, bufferMinutes: 10, endTime: "10:00", endDate: "2026-10-28", endDayOffset: 0 };
  return createRecurrence({ schemaVersion: 5, tasks: [task], start: "09:00", reviewsByDate: { "2026-10-28": "Review" }, goalTree: { goal: "G", groups: [{ id: "g", title: "Goal", taskIds: ["a"] }] } }, "a", "series", { frequency: "daily", startDate: "2026-10-28", untilDate: null, interval: 1 }, { from: "2026-10-28", through: "2026-10-28" });
}
function fixture(rows = [{ user_id: userId(1), plan: plan(), version: 2 }]) {
  const calls = { claim: 0, batch: 0, writes: [], finish: [] };
  let claimed = false;
  const deps = { now: () => now, store: {
    async claim(hash) {
      calls.claim++; assert.match(hash, /^[a-f0-9]{64}$/); assert.notEqual(hash, ticket);
      if (claimed) return null; claimed = true;
      return { id: leaseId, until: new Date(now.getTime() + 45000).toISOString(), cursor: null };
    },
    async batch(id) { calls.batch++; assert.equal(id, leaseId); return rows; },
    async write(id, user, version, next) { calls.writes.push({ id, user, version, next }); return true; },
    async finish(id, cursor, result) { calls.finish.push({ id, cursor, result: { ...result } }); return true; },
  } };
  return { deps, calls, rows };
}

test("maintenance rejects browser requests, wrong methods/types, bad and oversized tickets before database access", async () => {
  const { deps, calls } = fixture();
  const bad = [req({ ticket }, { origin: "https://seonyoungyoo16.github.io" }), new Request("https://example.invalid"), req({ ticket }, { "content-type": "text/plain" }), req({}), req({ ticket, extra: 1 }), req({ ticket: "x".repeat(257) }), req({ ticket: "A".repeat(64) }), new Request("https://example.invalid", { method: "POST", headers: { "content-type": "application/json" }, body: "[" })];
  const statuses = []; for (const item of bad) statuses.push((await handleMaintenance(item, deps)).status);
  assert.deepEqual(statuses, [403, 405, 415, 401, 401, 401, 401, 401]); assert.equal(calls.claim, 0);
});

test("one-use hashed tickets prepare the Korean rolling month without app state and replay cannot run a second batch", async () => {
  const { deps, calls, rows } = fixture(), raw = JSON.stringify(rows);
  const first = await handleMaintenance(req(), deps);
  assert.equal(first.status, 200); assert.deepEqual(await first.json(), { scanned: 1, prepared: 1, unchanged: 0, conflicted: 0, invalid: 0, failed: 0, retry: false });
  const write = calls.writes[0]; assert.equal(write.version, 2); assert.equal(write.user, userId(1));
  assert.equal(validPlan(write.next), true); assert.equal(write.next.tasks.length, 32); assert.equal(write.next.tasks.at(-1).repeatDate, "2026-11-28");
  assert.equal(write.next.tasks.at(-1).minutes, 60); assert.equal(write.next.tasks.at(-1).bufferMinutes, 10);
  assert.equal(write.next.goalTree.groups[0].taskIds.length, 32); assert.deepEqual(write.next.reviewsByDate, rows[0].plan.reviewsByDate);
  assert.equal(JSON.stringify(rows), raw); assert.equal(calls.finish[0].cursor, userId(1));
  assert.equal((await handleMaintenance(req(), deps)).status, 401); assert.equal(calls.batch, 1);
});

test("already prepared, completed, moved and skipped occurrences survive and no-op scans never increment a plan version", async () => {
  let source = materializeRecurrences(plan(), { from: "2026-10-28", through: "2026-10-29" }); source.tasks[0].done = true;
  // Individual edits/skips affect the original occurrence key, never a new clone.
  source = editRepeatOccurrence(source, { ...source.tasks[1], plannedDate: "2026-11-01", endDate: "2026-11-01", title: "Individual" });
  source = stopRecurrence(source, "series", "2026-10-30", "this");
  const first = fixture([{ user_id: userId(1), plan: source, version: 1 }]);
  await handleMaintenance(req(), first.deps); const prepared = first.calls.writes[0].next;
  assert.deepEqual(prepared.tasks.slice(0, 2), source.tasks.slice(0, 2)); assert.equal(prepared.tasks.some(t => t.repeatDate === "2026-10-30"), false);
  const second = fixture([{ user_id: userId(1), plan: prepared, version: 2 }]);
  const body = await (await handleMaintenance(req(), second.deps)).json();
  assert.equal(body.unchanged, 1); assert.equal(second.calls.writes.length, 0);
});

test("a concurrent plan edit is reported as a conflict without overwriting it or retrying stale data", async () => {
  const { deps, calls, rows } = fixture(); const raw = JSON.stringify(rows);
  deps.store.write = async () => false;
  const body = await (await handleMaintenance(req(), deps)).json();
  assert.equal(body.conflicted, 1); assert.equal(body.prepared, 0); assert.equal(calls.finish[0].cursor, userId(1)); assert.equal(JSON.stringify(rows), raw);
});

test("invalid or oversized account data and write failures do not prevent later accounts from being scanned", async () => {
  const huge = { ...plan(), extension: "가".repeat(400000) }; assert.equal(validPlan(huge), true);
  const rows = [{ user_id: userId(1), plan: { schemaVersion: 7 }, version: 1 }, { user_id: userId(2), plan: huge, version: 1 }, { user_id: userId(3), plan: plan(), version: 1 }, { user_id: userId(4), plan: plan(), version: 1 }];
  const { deps, calls } = fixture(rows);
  deps.store.write = async (id, user) => { if (user === userId(3)) throw new Error("sensitive server detail"); return true; };
  const response = await handleMaintenance(req(), deps), body = await response.json();
  assert.equal(response.status, 200); assert.equal(body.invalid, 1); assert.equal(body.failed, 2); assert.equal(body.prepared, 1);
  assert.equal(calls.finish[0].cursor, userId(4)); assert.equal(JSON.stringify(body).includes("sensitive"), false);
});

test("keyset completion resets only after an empty batch and malformed/unbounded adapters are rejected atomically", async () => {
  const empty = fixture([]); await handleMaintenance(req(), empty.deps); assert.equal(empty.calls.finish[0].cursor, null);
  for (const rows of [Array.from({ length: 6 }, (_, i) => ({ user_id: userId(i + 1), plan: plan(), version: 1 })), [{ user_id: userId(2), plan: plan(), version: 1 }, { user_id: userId(1), plan: plan(), version: 1 }]]) {
    const { deps, calls } = fixture(rows); const response = await handleMaintenance(req(), deps);
    assert.equal(response.status, 503); assert.equal(calls.writes.length, 0); assert.equal(calls.finish[0].cursor, null);
  }
});

test("runtime budget retains the last processed cursor and a read failure retains the prior cursor for retry", async () => {
  const f = fixture([1, 2].map(n => ({ user_id: userId(n), plan: plan(), version: 1 })));
  let advanced = false; f.deps.now = () => advanced ? new Date(now.getTime() + 19000) : now;
  f.deps.store.write = async () => { advanced = true; return true; };
  const body = await (await handleMaintenance(req(), f.deps)).json(); assert.equal(body.scanned, 1); assert.equal(f.calls.finish[0].cursor, userId(1));
  const g = fixture(); g.deps.store.claim = async () => ({ id: leaseId, cursor: userId(9), until: new Date(now.getTime() + 45000).toISOString() });
  g.deps.store.batch = async () => { throw new Error("network failure"); };
  assert.equal((await handleMaintenance(req(), g.deps)).status, 503); assert.equal(g.calls.finish[0].cursor, userId(9));
});

test("expired/invalid leases, revoked finish and infrastructure errors never claim success or expose secrets", async () => {
  for (const lease of [{ id: leaseId, until: now.toISOString(), cursor: null }, { id: "bad", until: "never", cursor: null }]) {
    const { deps, calls } = fixture(); deps.store.claim = async () => lease;
    assert.equal((await handleMaintenance(req(), deps)).status, 409); assert.equal(calls.batch, 0); assert.equal(calls.writes.length, 0);
  }
  const f = fixture(); f.deps.store.finish = async () => false; assert.equal((await handleMaintenance(req(), f.deps)).status, 409);
  const g = fixture(); g.deps.store.claim = async () => { throw new Error("secret credential"); };
  const response = await handleMaintenance(req(), g.deps); assert.equal(response.status, 503); assert.equal((await response.text()).includes("secret"), false);
});
