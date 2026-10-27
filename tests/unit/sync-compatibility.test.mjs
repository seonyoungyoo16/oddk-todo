import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { validPlan } from "../../supabase/functions/_shared/plan.ts";
import { loadPlan, upgradeStoredPlan, preserveMigrationBackup } from "../../supabase/functions/_shared/plan-migration.ts";

const legacy = () => ({ start: "09:00", tasks: [{ id: "synthetic", title: "Synthetic", minutes: 30, bufferMinutes: 5, startTime: "09:00", priority: "normal", done: false }], review: "Undated" });
const modern = () => loadPlan(JSON.stringify(legacy())).plan;
const key = "oddk.sync.plan.account-a";
const localKey = "oddk.todo.v1";
const js = ts.transpileModule(readFileSync(new URL("../../app/todo/sync-store.ts", import.meta.url), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const copy = (value) => JSON.parse(JSON.stringify(value));
function harness({ plan = modern(), dirty = false, cached = plan, values = new Map(), connected = true } = {}) {
  const auth = (id) => ({ user: { id, email: `${id}@example.invalid`, user_metadata: {}, app_metadata: { provider: "email" }, created_at: "2026-01-01" }, access_token: "synthetic-only" });
  let login = auth("account-a"), listener;
  const session = (id) => ({ id, deviceId: `device-${id}`, name: `${id}@example.invalid` });
  if (!values.has(localKey)) values.set(localKey, JSON.stringify(modern()));
  if (connected && !values.has("oddk.sync.session.v1")) values.set("oddk.sync.session.v1", JSON.stringify(session("account-a")));
  if (cached && !values.has(key)) values.set(key, JSON.stringify({ plan: JSON.stringify(cached), version: 4, dirty }));
  const jobs = new Map(); let nextJob = 0;
  const remote = { plan: copy(plan), version: 4, updated_at: "synthetic-time" };
  const calls = [], oauthCalls = []; let intercept;
  let download;
  const window = new EventTarget(), document = Object.assign(new EventTarget(), { visibilityState: "visible", createElement: () => ({ click() {} }) });
  window.location = { origin: "https://example.invalid" };
  const storage = { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: (k) => values.delete(k) };
  const client = { auth: {
    signInWithOAuth: async (options) => { oauthCalls.push(copy(options)); return { error: null }; },
    getSession: async () => ({ data: { session: login }, error: null }),
    onAuthStateChange: (callback) => { listener = callback; return { data: { subscription: { unsubscribe() {} } } }; },
    signOut: async () => { login = null; listener?.("SIGNED_OUT", null); return {}; },
  } };
  const exports = {};
  vm.runInNewContext(js, { exports, require: (name) => name.includes("plan-migration") ? { loadPlan, upgradeStoredPlan, preserveMigrationBackup } : name.includes("_shared/plan") ? { validPlan } : { syncClient: () => client },
    process: { env: { NEXT_PUBLIC_BASE_PATH: "/oddk-todo" } }, localStorage: storage, window, document, Event, Error, TypeError, Set, crypto, AbortSignal, Blob, URL: { createObjectURL(blob) { download = blob; return "blob:synthetic"; }, revokeObjectURL() {} },
    setTimeout: (job) => { jobs.set(++nextJob, job); return nextJob; }, clearTimeout: (id) => jobs.delete(id), setInterval: () => 0, clearInterval() {},
    fetch: async (_url, options) => {
      const body = JSON.parse(options.body); calls.push(copy(body));
      if (intercept) { const response = await intercept(body); if (response) return response; }
      if (body.action === "push") {
        if (body.version !== remote.version) return new Response(JSON.stringify({ error: "conflict" }), { status: 409 });
        remote.plan = copy(body.plan); remote.version++;
      }
      return new Response(JSON.stringify(remote));
    },
  });
  return { store: exports, values, remote, calls, oauthCalls, set intercept(fn) { intercept = fn; }, async jobs() { const pending = [...jobs.values()]; jobs.clear(); for (const job of pending) await job(); await new Promise(setImmediate); },
    async login(id) { login = id ? auth(id) : null; listener?.(id ? "SIGNED_IN" : "SIGNED_OUT", login); await this.jobs(); await new Promise(setImmediate); },
    async download() { exports.exportPlanBackup("null", true); return JSON.parse(await download.text()); }, cache() { return JSON.parse(values.get(key)); }, snapshot() { return JSON.parse(exports.getPlanSnapshot("null")); }, status() { return JSON.parse(exports.getSyncSnapshot()); } };
}

test("both OAuth providers start with the Pages callback without changing plan caches", async () => {
  const h = harness(); const before = [...h.values.entries()];
  for (const provider of ["google", "github"]) {
    await h.store.loginSync(provider);
    assert.equal(h.values.get("oddk.sync.login-provider"), provider);
  }
  assert.deepEqual(h.oauthCalls, ["google", "github"].map(provider => ({provider, options: {redirectTo: "https://example.invalid/oddk-todo/todo/"}})));
  for (const [key,value] of before) assert.equal(h.values.get(key), value);
  assert.equal(h.calls.length, 0);
});

test("V1 account migration uses the existing CAS version and preserves original before V2", async () => {
  const h = harness({ plan: legacy(), cached: legacy() });
  await h.store.syncNow();
  assert.equal(h.calls[0].version, 4); assert.equal(h.remote.version, 5);
  assert.equal(h.remote.plan.schemaVersion, 3); assert.equal(h.remote.plan.tasks[0].plannedDate, null);
  assert.equal(h.remote.plan.tasks[0].startTime, "09:00");
  assert.deepEqual(JSON.parse(h.values.get(`${key}.before-v2`)), legacy());
  await h.store.syncNow(); assert.equal(h.remote.version, 5);
});

test("V1 received on first login is migrated and conditionally saved", async () => {
  const h = harness({ plan: legacy(), cached: null, connected: false });
  const stop = h.store.startSync(JSON.stringify(modern()));
  await new Promise(setImmediate); await h.jobs(); await h.store.syncNow();
  assert.equal(h.remote.plan.schemaVersion, 3); assert.equal(h.remote.version, 5);
  assert.deepEqual(JSON.parse(h.values.get(`${key}.before-v2`)), legacy()); stop();
});

test("migration race becomes whole-plan conflict and both choices preserve the unchosen plan", async () => {
  const h = harness({ plan: legacy(), cached: legacy() });
  const other = modern(); other.reviewsByDate["2026-10-28"] = "Other date";
  h.remote.plan = other; h.remote.version = 5;
  await h.store.syncNow(); assert.equal(h.status().phase, "conflict");
  assert.equal(h.snapshot().review, "Undated");
  await h.store.resolveSyncConflict("local");
  assert.deepEqual(JSON.parse(h.values.get(`${key}.backup`)), other);
  assert.equal(h.remote.version, 6); assert.deepEqual(h.remote.plan.reviewsByDate, {});
  h.remote.plan = { ...modern(), review: "Other again" }; h.remote.version++;
  h.store.writePlan({ ...modern(), review: "Unchosen local" }); await h.store.syncNow();
  await h.store.resolveSyncConflict("cloud");
  assert.equal(JSON.parse(h.values.get(`${key}.backup`)).review, "Unchosen local");
  assert.equal(h.snapshot().review, "Other again");
});

test("offline outbox survives a fresh store instance and reconnect", async () => {
  const h = harness(); h.intercept = () => { throw new TypeError("offline"); };
  const edited = { ...modern(), reviewsByDate: { "2026-10-27": "Offline draft" } };
  h.store.writePlan(edited); await h.store.syncNow(); assert.equal(h.cache().dirty, true);
  const restarted = harness({ values: h.values });
  await restarted.store.syncNow(); assert.deepEqual(restarted.remote.plan, edited); assert.equal(restarted.cache().dirty, false);
});

test("editing while push or pull is pending never loses the newer local plan", async () => {
  for (const dirty of [true, false]) {
    const h = harness({ dirty }); let release, entered;
    const waiting = new Promise((resolve) => { entered = resolve; });
    h.intercept = () => new Promise((resolve) => { release = () => resolve(null); entered(); });
    const pending = h.store.syncNow(); await waiting;
    const edited = { ...modern(), review: "Edited during request" }; h.store.writePlan(edited);
    release(); await pending; assert.deepEqual(h.snapshot(), edited); assert.equal(h.cache().dirty, true);
    h.intercept = null; await h.store.syncNow(); assert.deepEqual(h.remote.plan, edited); assert.equal(h.cache().dirty, false);
  }
});

test("invalid/future remote preserves valid cache, dirty outbox and raw received backup", async () => {
  for (const dirty of [false, true]) {
    const h = harness({ dirty }); const before = h.values.get(key);
    h.remote.plan = { ...modern(), schemaVersion: 99 }; h.remote.version++;
    await h.store.syncNow(); assert.equal(h.status().phase, "error");
    assert.equal(h.values.get(key), before); assert.equal(h.snapshot().schemaVersion, 3);
    assert.ok([...h.values.keys()].some((k) => k.startsWith(`${key}.invalid-remote.`)));
  }
});

test("426 stops repeated writes and requests refresh without clearing the outbox", async () => {
  const h = harness({ dirty: true }); const before = h.values.get(key);
  h.intercept = () => new Response(JSON.stringify({ error: "upgrade" }), { status: 426 });
  await h.store.syncNow(); assert.equal(h.status().refreshRequired, true);
  assert.equal(h.values.get(key), before); const count = h.calls.length;
  assert.throws(() => h.store.writePlan(modern())); await h.store.syncNow(); assert.equal(h.calls.length, count);
});

test("unreadable cache is exposed for recovery instead of a fallback empty plan", () => {
  const h = harness(); h.values.set(key, "{");
  assert.equal(h.store.getPlanSnapshot(JSON.stringify(modern())), "{");
  assert.throws(() => h.store.writePlan(modern())); assert.equal(h.values.get(key), "{");
  h.values.set(key, JSON.stringify({ plan: "{", version: 4, dirty: true }));
  h.values.set(`${key}.last-valid`, JSON.stringify(modern()));
  h.store.restoreLastValidPlan(); assert.equal(h.cache().dirty, true); assert.deepEqual(h.snapshot(), modern());
  assert.ok([...h.values.entries()].some(([k,v]) => k.startsWith(`${key}.recovery-original.`) && v === "{"));
});

test("an old account response cannot replace a new account cache during account switching", async () => {
  const h = harness(); const stop = h.store.startSync(JSON.stringify(modern()));
  await new Promise(setImmediate);
  let release, entered; const enteredPromise = new Promise((resolve) => { entered = resolve; });
  h.intercept = () => new Promise((resolve) => { release = () => resolve(new Response(JSON.stringify({ plan: { ...modern(), review: "A delayed" }, version: 5, updated_at: "synthetic" }))); entered(); });
  const pending = h.store.syncNow(); await enteredPromise;
  h.intercept = null; h.remote.plan = { ...modern(), review: "B visible" };
  await h.login("account-b"); assert.equal(h.snapshot().review, "B visible");
  release(); await pending; assert.equal(h.snapshot().review, "B visible");
  assert.equal(JSON.parse(h.values.get("oddk.sync.session.v1")).id, "account-b"); stop();
});

test("logout restores anonymous plan; account switch never exports another account backup", async () => {
  const h = harness(); h.values.set(localKey, JSON.stringify({ ...modern(), review: "Anonymous original" }));
  assert.equal(h.store.getPlanScope(), "account-a");
  h.values.set("oddk.sync.backup.v1", JSON.stringify({ ...modern(), review: "Old unscoped sensitive backup" }));
  h.store.backupReviewPlan({ ...modern(), review: "A only backup" });
  await h.store.disconnectSync(); assert.equal(h.snapshot().review, "Anonymous original");
  assert.equal(h.store.getPlanScope(), "local");
  const stop = h.store.startSync(JSON.stringify(modern())); await h.login("account-b");
  assert.equal(h.status().connected, true);
  assert.equal(h.store.getPlanScope(), "account-b");
  assert.equal((await h.download()).review, "Anonymous original");
  assert.equal(JSON.parse(h.values.get("oddk.sync.plan.account-b.backup")).review, "Anonymous original");
  assert.equal(JSON.parse(h.values.get(`${key}.backup`)).schemaVersion, 3); stop();
});
