import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const url = "https://synxmskamifpovuziecx.supabase.co";
const key = "sb_publishable_ACwZjSLbL_dU9hilmAV7CQ_FEH8AT29";
const users = JSON.parse(readFileSync(new URL("../.sync-auth-fixture.json", import.meta.url), "utf8"));
const initial = JSON.parse(readFileSync(new URL("../app/todo/initial-plan.json", import.meta.url), "utf8"));
async function login(index) {
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email: users[index].email, password: users[index].password });
  assert.equal(error, null, error?.message); return { client, token: data.session.access_token };
}
async function api(action, body, token, expected = 200) {
  const response = await fetch(`${url}/functions/v1/plan-sync`, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ action, ...body }) });
  const data = await response.json(); assert.equal(response.status, expected, data.error); return data;
}
const a = await login(0), b = await login(0), other = await login(1);
await api("pull", {}, undefined, 401);
const first = await api("ensure", { plan: initial }, a.token);
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
const { data: rows, error: readError } = await other.client.from("account_plans").select("user_id").eq("user_id", users[0].id);
assert.equal(readError, null); assert.deepEqual(rows, []);
const { data: updated, error: updateError } = await other.client.from("account_plans").update({ plan: initial }).eq("user_id", users[0].id).select("user_id");
assert.equal(updateError, null); assert.deepEqual(updated, []);
const anonymous = createClient(url, key, { auth: { persistSession: false } });
assert.ok((await anonymous.from("account_plans").select("user_id")).error);
await api("push", { plan: {}, version: saved.version }, a.token, 400);
console.log("PASS: verified login JWT, initial import, same-account cross-device task+mandala, existing cloud preservation, CAS conflict, different-account isolation, RLS read/update and anonymous denial, validation");
