// Optional live end-to-end test. Creates its own disposable users via Auth Admin;
// it cannot target existing accounts. Never reads admin credentials from source.
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
const target = new URL(process.env.ODDK_SUPABASE_URL ?? "https://synxmskamifpovuziecx.supabase.co");
const local = ["127.0.0.1", "localhost", "[::1]"].includes(target.hostname);
assert.ok((local && target.protocol === "http:") || target.origin === "https://synxmskamifpovuziecx.supabase.co", "Only the configured project or a loopback test stack is allowed");
assert.ok(!target.username && !target.password && target.pathname === "/" && !target.search && !target.hash, "Use the Supabase base URL");
const url = target.origin;
const publicKey = process.env.ODDK_SUPABASE_PUBLIC_KEY ?? (local ? "" : "sb_publishable_ACwZjSLbL_dU9hilmAV7CQ_FEH8AT29");
assert.ok(publicKey, "Set ODDK_SUPABASE_PUBLIC_KEY for the local test stack");
const adminKey = process.env.ODDK_SUPABASE_ADMIN_KEY;
if (!adminKey) throw Error("Set ODDK_SUPABASE_ADMIN_KEY locally to run the disposable-account test. Never paste it into chat.");
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, adminKey, options), client = createClient(url, publicKey, options);
const created = new Set();
async function create() {
  const email = `account-deletion-${crypto.randomUUID()}@example.invalid`, password = crypto.randomUUID() + crypto.randomUUID();
  const result = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(result.error, null, "Disposable account creation failed");
  created.add(result.data.user.id);
  return { id: result.data.user.id, email, password };
}
let primaryFailure;
try {
  const account = await create(), other = await create();
  for (const id of [account.id, other.id]) {
    const result = await admin.from("account_plans").insert({ user_id: id, plan: { tasks: [], start: "09:00" } });
    assert.equal(result.error, null);
  }
  const stamp = new Date().toISOString(), recordId = crypto.randomUUID();
  const fixtures = [
    ["execution_records", { user_id: account.id, id: recordId, data: { schemaVersion: 1, id: recordId, taskId: "synthetic", title: "Disposable deletion check", plannedDate: null, plannedWorkMinutes: null, plannedTotalMinutes: null, startedAt: stamp, endedAt: stamp, finishReason: "manual", needsReview: false, segments: [{ kind: "work", start: stamp, end: stamp }] } }],
    ["execution_states", { user_id: account.id, version: 1 }],
    ["execution_operations", { user_id: account.id, operation_id: crypto.randomUUID(), request_hash: "a".repeat(64), kind: "manual", applied_version: 1 }],
    ["push_subscriptions", { user_id: account.id, installation_id: crypto.randomUUID(), binding_hash: "b".repeat(64), revision: 1, label: "Disposable test", enabled: false }],
  ];
  for (const [table, row] of fixtures) {
    const result = await admin.from(table).insert(row);
    assert.equal(result.error, null, `${table} fixture failed`);
  }
  const task = { id: "synthetic", title: "Disposable deletion check", done: false, priority: "normal", minutes: 30, bufferMinutes: 5, startTime: null, plannedDate: null };
  const updated = await admin.from("account_plans").update({ plan: { tasks: [task], start: "09:00" }, version: 2 }).eq("user_id", account.id);
  assert.equal(updated.error, null);
  const activeId = crypto.randomUUID();
  const context = await admin.rpc("execution_context", { p_user: account.id, p_target: null, p_operation: activeId });
  assert.equal(context.error, null);
  const active = { schemaVersion: 1, id: activeId, taskId: task.id, title: task.title, plannedDate: null, plannedWorkMinutes: 25, plannedTotalMinutes: 30, startedAt: context.data.now, endedAt: null, finishReason: null, needsReview: false, segments: [{ kind: "work", start: context.data.now, end: null }] };
  const running = await admin.rpc("execution_commit", { p_user: account.id, p_operation: activeId, p_hash: "c".repeat(64), p_kind: "start", p_revision: context.data.revision, p_plan_version: context.data.planVersion, p_records: [active], p_active: activeId });
  assert.equal(running.error, null, "Active execution fixture failed");
  assert.equal(running.data.current.id, activeId);
  // A synthetic non-Apple credential exercises Vault cleanup without contacting Apple.
  const saved = await admin.rpc("account_apple_token_save", { p_user: account.id, p_token: `synthetic-not-an-apple-token-${crypto.randomUUID()}` });
  assert.equal(saved.error, null);
  const auth = await client.auth.signInWithPassword({ email: account.email, password: account.password });
  assert.equal(auth.error, null);
  const operation = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex");
  const endpoint = `${url}/functions/v1/account-lifecycle`;
  const rejected = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.data.session.access_token}` }, body: JSON.stringify({ action: "delete", operation, confirmation: "DELETE_ACCOUNT", userId: other.id }) });
  assert.equal(rejected.status, 400, "Client-supplied deletion target was not rejected");
  const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.data.session.access_token}` }, body: JSON.stringify({ action: "delete", operation, confirmation: "DELETE_ACCOUNT" }) });
  assert.equal(response.status, 200, "Disposable deletion failed");
  assert.equal((await response.json()).state, "deleted");
  assert.equal((await admin.auth.admin.getUserById(account.id)).data.user, null);
  const rows = await admin.from("account_plans").select("user_id").in("user_id", [account.id, other.id]);
  assert.deepEqual(rows.data, [{ user_id: other.id }]);
  for (const table of [...fixtures.map(([table]) => table), "account_apple_credentials"]) {
    const remaining = await admin.from(table).select("user_id").eq("user_id", account.id);
    assert.equal(remaining.error, null); assert.deepEqual(remaining.data, [], `${table} was not erased`);
  }
  const stale = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.data.session.access_token}` }, body: JSON.stringify({ action: "delete", operation, confirmation: "DELETE_ACCOUNT" }) });
  assert.equal(stale.status, 401, "Deleted account's access token still authenticates");
  const receipt = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "status", operation }) });
  assert.equal((await receipt.json()).state, "deleted");
  console.log(`Disposable Auth Admin deletion with an active timer, plan/execution/push/credential cascade, other-account preservation, stale-token rejection and receipt recovery passed (${target.host}).`);
} catch (error) {
  primaryFailure = error;
  throw error;
} finally {
  await client.auth.signOut({ scope: "local" });
  const failures = [];
  for (const id of created) {
    const result = await admin.auth.admin.deleteUser(id, false);
    if (result.error && result.error.status !== 404) failures.push(result.error.status);
  }
  if (failures.length && primaryFailure) console.error(`Disposable cleanup also failed (${failures.join(",")}).`);
  else assert.deepEqual(failures, [], "Disposable fixture cleanup failed");
}
