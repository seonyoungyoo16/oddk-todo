import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import ts from "typescript";
import { loadPlan } from "../supabase/functions/_shared/plan-migration.ts";
const values = new Map();
globalThis.localStorage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
globalThis.window = Object.assign(new EventTarget(), { location: { href: "http://localhost:3000/todo/", hash: "", search: "" }, localStorage });
globalThis.document = Object.assign(new EventTarget(), { visibilityState: "visible" });
globalThis.BroadcastChannel = undefined;
mkdirSync(new URL("../.sync-test-runtime/", import.meta.url), { recursive: true });
for (const name of ["supabase-client", "sync-store"]) {
  const source = readFileSync(new URL(`../app/todo/${name}.ts`, import.meta.url), "utf8");
  const configuredSource = source.replaceAll("https://synxmskamifpovuziecx.supabase.co/functions/v1/plan-sync", `https://synxmskamifpovuziecx.supabase.co/functions/v1/${process.env.ODDK_TEST_EDGE_FUNCTION ?? "plan-sync"}`);
  const js = ts.transpileModule(configuredSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText.replace('"./supabase-client"', '"./supabase-client.mjs"').replace('"../../supabase/functions/_shared/plan"', '"../supabase/functions/_shared/plan.ts"').replace('"../../supabase/functions/_shared/plan-migration"', '"../supabase/functions/_shared/plan-migration.ts"');
  writeFileSync(new URL(`../.sync-test-runtime/${name}.mjs`, import.meta.url), js);
}
const store = await import("../.sync-test-runtime/sync-store.mjs");
const { syncClient } = await import("../.sync-test-runtime/supabase-client.mjs");
const users = JSON.parse(readFileSync(new URL("../.sync-auth-fixture.json", import.meta.url), "utf8"));
const initial = { tasks: [], start: "09:00" };
const fallback = JSON.stringify(initial);
const originalFetch = fetch;
const endpoint = `https://synxmskamifpovuziecx.supabase.co/functions/v1/${process.env.ODDK_TEST_EDGE_FUNCTION ?? "plan-sync"}`;
async function api(action, body, token) {
  const response = await originalFetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ action, ...body }) });
  assert.equal(response.status, 200); return response.json();
}
async function until(test) { const deadline = Date.now() + 10000; while (!test()) { if (Date.now() > deadline) throw new Error("state wait timed out"); await new Promise((resolve) => setTimeout(resolve, 20)); } }
store.writePlan({ ...initial, review: "로그인 전 목록" });
const initialAuth = await syncClient().auth.signInWithPassword({ email: users[0].email, password: users[0].password });
assert.equal(initialAuth.error, null);
const legacyServer = await api("pull", {}, initialAuth.data.session.access_token);
assert.equal(legacyServer.plan.schemaVersion, undefined);
const stop = store.startSync(fallback);
try {
  const auth = await syncClient().auth.signInWithPassword({ email: users[0].email, password: users[0].password }); assert.equal(auth.error, null);
  await until(() => JSON.parse(store.getSyncSnapshot()).phase === "synced");
  assert.equal(JSON.parse(values.get(`oddk.sync.plan.${users[0].id}.backup`)).review, "로그인 전 목록");
  const before = await api("pull", {}, auth.data.session.access_token);
  assert.equal(before.plan.schemaVersion, 2);
  assert.equal(before.version, legacyServer.version + 1);
  assert.deepEqual(before.plan, loadPlan(JSON.stringify(legacyServer.plan)).plan);
  assert.deepEqual(JSON.parse(values.get(`oddk.sync.plan.${users[0].id}.before-v2`)), legacyServer.plan);
  assert.deepEqual(JSON.parse(store.getPlanSnapshot(fallback)), before.plan);
  const remote = { ...before.plan, review: "다른 기기 변경" };
  await api("push", { plan: remote, version: before.version }, auth.data.session.access_token);
  const local = { ...before.plan, review: "오프라인 변경" };
  globalThis.fetch = async (url, options) => { if (String(url).includes("/functions/")) throw new TypeError("offline"); return originalFetch(url, options); };
  store.writePlan(local); await store.syncNow();
  assert.equal(JSON.parse(store.getSyncSnapshot()).phase, "waiting");
  assert.deepEqual(JSON.parse(store.getPlanSnapshot(fallback)), loadPlan(JSON.stringify(local)).plan);
  globalThis.fetch = originalFetch; await store.syncNow();
  assert.equal(JSON.parse(store.getSyncSnapshot()).phase, "conflict");
  assert.ok(store.conflictPreview().local.includes("오프라인 변경"));
  await store.resolveSyncConflict("cloud"); assert.equal(JSON.parse(store.getPlanSnapshot(fallback)).review, "다른 기기 변경");
  assert.equal(JSON.parse(values.get(`oddk.sync.plan.${users[0].id}.backup`)).review, "오프라인 변경");
  store.writePlan({ ...remote, review: "동기화할 최종 내용" }); await store.syncNow();
  assert.equal((await api("pull", {}, auth.data.session.access_token)).plan.review, "동기화할 최종 내용");
  await store.disconnectSync(); assert.equal(JSON.parse(store.getSyncSnapshot()).phase, "local");
  assert.equal(JSON.parse(store.getPlanSnapshot(fallback)).review, "로그인 전 목록");
  console.log("PASS: authenticated hydrate, pre-login backup, existing account load, offline queue, conflict preview/resolution+backup, upload, logout isolation");
} finally { globalThis.fetch = originalFetch; stop(); syncClient().auth.stopAutoRefresh(); }
