import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const url = process.env.ODDK_TEST_SUPABASE_URL ?? "https://synxmskamifpovuziecx.supabase.co";
const functionName = process.env.ODDK_TEST_EDGE_FUNCTION ?? "plan-sync";
const table = process.env.ODDK_TEST_TABLE ?? "account_plans";
const key = "sb_publishable_ACwZjSLbL_dU9hilmAV7CQ_FEH8AT29";
const users = JSON.parse(readFileSync(new URL("../.sync-auth-fixture.json", import.meta.url), "utf8"));
const initial = { tasks: [], start: "09:00", mandala: { goal: "Synthetic goal", areas: Array.from({ length: 8 }, () => ({ title: "", taskIds: Array(8).fill("") })) } };
async function login(index) {
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email: users[index].email, password: users[index].password });
  assert.equal(error, null, error?.message); return { client, token: data.session.access_token };
}
async function api(action, body, token, expected = 200) {
  const response = await fetch(`${url}/functions/v1/${functionName}`, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ action, ...body }) });
  const data = await response.json(); assert.equal(response.status, expected, data.error); return data;
}
const a = await login(0), b = await login(0), other = await login(1);
await api("pull", {}, undefined, 401);
const [first, simultaneousEnsure] = await Promise.all([api("ensure", { plan: initial }, a.token), api("ensure", { plan: initial }, b.token)]);
assert.deepEqual(first, simultaneousEnsure);
assert.deepEqual(first.plan, initial);
const task = { id: crypto.randomUUID(), title: "[검증] 계정 동기화", minutes: 60, bufferMinutes: 10, startTime: "09:00", priority: "normal", done: false };
const plan = structuredClone(initial); plan.tasks.push(task); plan.mandala.areas[0].taskIds[0] = task.id;
const saved = await api("push", { plan, version: first.version }, a.token);
assert.deepEqual((await api("pull", {}, b.token)).plan, plan);
const existing = await api("ensure", { plan: { ...initial, review: "기존 서버 내용을 덮으면 안 됨" } }, b.token);
assert.deepEqual(existing.plan, plan);
await api("push", { plan: initial, version: first.version }, b.token, 409);
assert.equal((await api("pull", {}, a.token)).version, saved.version);
await api("ensure", { plan: initial }, other.token);
assert.deepEqual((await api("pull", { user_id: users[0].id }, other.token)).plan, initial);
const { data: rows, error: readError } = await other.client.from(table).select("user_id").eq("user_id", users[0].id);
assert.equal(readError, null); assert.deepEqual(rows, []);
const { data: updated, error: updateError } = await other.client.from(table).update({ plan: initial }).eq("user_id", users[0].id).select("user_id");
assert.ok(updateError); assert.equal(updated, null);
const anonymous = createClient(url, key, { auth: { persistSession: false } });
assert.ok((await anonymous.from(table).select("user_id")).error);
await api("push", { plan: {}, version: saved.version }, a.token, 400);
async function stored() {
  const { data, error } = await a.client.from(table).select("plan,version,updated_at").eq("user_id", users[0].id).single();
  assert.equal(error, null); return data;
}
const unchanged = await stored();
for (const change of [
  { minutes: 25, bufferMinutes: 30 }, { minutes: 25, bufferMinutes: null },
  { minutes: null, bufferMinutes: 5 }, { minutes: 0, bufferMinutes: 1 },
  { minutes: -1, bufferMinutes: 1 }, { minutes: 30.5, bufferMinutes: 5 },
  { minutes: 241, bufferMinutes: 1 }, { minutes: null, bufferMinutes: null, startTime: "09:00" },
]) {
  const invalid = { ...plan, tasks: [{ ...task, ...change }] };
  for (const action of ["ensure", "push"]) {
    await api(action, { plan: invalid, version: saved.version }, a.token, 400);
    assert.deepEqual(await stored(), unchanged);
  }
}
for (const [body, status] of [["{", 400], ["null", 400], ["[]", 400], ["x".repeat(1000001), 413]]) {
  const response = await fetch(`${url}/functions/v1/${functionName}`, { method: "POST", headers: { Authorization: `Bearer ${a.token}`, "Content-Type": "application/json" }, body });
  assert.equal(response.status, status);
  assert.deepEqual(await stored(), unchanged);
}
for (const client of [anonymous, a.client, other.client]) {
  assert.ok((await client.from(table).insert({ user_id: users[0].id, plan: initial })).error);
  assert.ok((await client.from(table).update({ plan: initial }).eq("user_id", users[0].id)).error);
  assert.deepEqual(await stored(), unchanged);
}
const otherBefore = await api("pull", {}, other.token);
const parallel = await Promise.all(["one", "two"].map(async (review) => {
  const response = await fetch(`${url}/functions/v1/${functionName}`, { method: "POST", headers: { Authorization: `Bearer ${a.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "push", user_id: users[1].id, plan: { ...plan, review }, version: saved.version }) });
  return response.status;
}));
assert.deepEqual(parallel.sort(), [200, 409]);
const winner = await stored();
assert.equal(winner.version, saved.version + 1);
assert.ok(["one", "two"].includes(winner.plan.review));
await api("push", { plan: initial, version: saved.version }, a.token, 409);
assert.deepEqual(await stored(), winner);
assert.deepEqual(await api("pull", {}, other.token), otherBefore);
await a.client.auth.signOut(); await b.client.auth.signOut(); await other.client.auth.signOut();
console.log("PASS: ensure race, same-account task+mandala, owner read, cross-account isolation, direct writes denied, invalid JSON/400/413 preserve plan+version+updated_at, concurrent CAS winner+409, ownership body ignored");
