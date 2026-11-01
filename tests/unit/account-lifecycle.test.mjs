import test from "node:test";
import assert from "node:assert/strict";
import { handleLifecycle, operationHash, LifecycleError } from "../../supabase/functions/account-lifecycle/handler.ts";
import { eraseAccountData, pendingDeletion, DELETION_KEY } from "../../app/todo/account-data.ts";
const operation = "a".repeat(64);
const deletion = { action: "delete", confirmation: "DELETE_ACCOUNT", operation };
function harness({ apple = false } = {}) {
  const calls = [], receipts = new Map();
  const services = {
    authenticate: async token => token === "valid" ? { id: "account-a", appleSubjects: apple ? ["apple-a"] : [] } : null,
    receipt: async hash => receipts.get(hash) ?? null,
    begin: async (hash, user) => { calls.push(["begin", user]); if (!receipts.has(hash)) receipts.set(hash, { user_id: user }); return receipts.get(hash); },
    tokens: async () => ["apple-refresh"],
    saveToken: async (user, token) => { calls.push(["save", user, token]); },
    validateAppleToken: async (token, subjects) => { calls.push(["validate", token, subjects]); },
    revokeAppleToken: async token => { calls.push(["revoke", token]); },
    deleteUser: async user => { calls.push(["delete", user]); for (const [hash, receipt] of receipts) if (receipt.user_id === user) receipts.set(hash, { user_id: null }); },
    appleReady: () => apple,
  };
  return { services, calls, receipts, run: (body = deletion, token = "valid") => handleLifecycle(body, token, services) };
}
test("deletion requires server-authenticated owner and explicit confirmation", async () => {
  const h = harness();
  await assert.rejects(h.run(deletion, "expired"), e => e.status === 401);
  await assert.rejects(h.run({ ...deletion, confirmation: "" }), e => e.status === 400);
  await assert.rejects(h.run({ ...deletion, userId: "account-b" }), e => e.status === 400);
  await assert.rejects(h.run({ ...deletion, operation: "guess" }));
  assert.deepEqual(h.calls, []);
  assert.deepEqual(await h.run(), { state: "deleted" });
  assert.deepEqual(h.calls, [["begin", "account-a"], ["delete", "account-a"]]);
});
test("Apple revocation failure prevents account/data deletion", async () => {
  const h = harness({ apple: true });
  h.services.revokeAppleToken = async () => { throw new LifecycleError("Apple retry", 409, "apple_reauthentication_required"); };
  await assert.rejects(h.run(), e => e.code === "deletion_pending");
  assert.deepEqual(h.calls, [["begin", "account-a"]]);
  assert.equal(h.receipts.size, 1);
  h.services.tokens = async () => [];
  await assert.rejects(h.run(), e => e.code === "apple_reauthentication_required");
});
test("revoke every Apple credential before deleting; ignore untrusted identity metadata", async () => {
  const h = harness({ apple: true });
  h.services.tokens = async () => ["refresh-a", "refresh-b"];
  await h.run();
  assert.deepEqual(h.calls, [["begin", "account-a"], ["revoke", "refresh-a"], ["revoke", "refresh-b"], ["delete", "account-a"]]);
});
test("an Apple webhook winning the deletion race still leaves a completed receipt", async () => {
  const h = harness({ apple: true });
  h.services.revokeAppleToken = async () => {
    const hash = await operationHash(operation);
    assert.equal(h.receipts.get(hash).user_id, "account-a");
    h.receipts.set(hash, { user_id: null });
  };
  h.services.deleteUser = async () => { throw Error("Already deleted by Apple webhook"); };
  assert.deepEqual(await h.run(), { state: "deleted" });
  assert.deepEqual(await h.run({ action: "status", operation }, ""), { state: "deleted" });
});
test("lost response resolves through receipt without authenticating a deleted user", async () => {
  const h = harness();
  const remove = h.services.deleteUser;
  h.services.deleteUser = async (...args) => { await remove(...args); throw Error("response lost"); };
  assert.deepEqual(await h.run(), { state: "deleted" });
  assert.deepEqual(await h.run({ action: "status", operation }, ""), { state: "deleted" });
  assert.deepEqual(await h.run({ action: "status", operation: "b".repeat(64) }, ""), { state: "unknown" });
  assert.equal(h.calls.filter(c => c[0] === "delete").length, 1);
});
test("unfinished deletion is retryable, and receipts cannot target another user", async () => {
  const h = harness();
  h.services.deleteUser = async () => { throw Error("temporary outage"); };
  await assert.rejects(h.run(), e => e.code === "deletion_pending");
  assert.deepEqual(await h.run({ action: "status", operation }, ""), { state: "pending" });
  h.receipts.set(await operationHash(operation), { user_id: "account-b" });
  await assert.rejects(h.run(), e => e.status === 403);
});
test("Apple token capture validates server identity before encrypted storage", async () => {
  const h = harness({ apple: true });
  const body = { action: "apple-token", refreshToken: "new-refresh-token-for-apple" };
  await h.run(body);
  assert.equal(h.calls[0][0], "validate"); assert.equal(h.calls[1][0], "save");
  h.services.validateAppleToken = async () => { throw new LifecycleError("wrong Apple account", 403); };
  h.calls.length = 0;
  await assert.rejects(h.run(body), e => e.status === 403);
  assert.deepEqual(h.calls, []);
});
test("local cleanup removes only the deleted account; marker survives cleanup failure", () => {
  const values = new Map([
    ["oddk.todo.v1", "guest"], ["oddk.sync.plan.account-a", "plan"], ["oddk.sync.plan.account-a.backup.1", "backup"],
    ["oddk.drafts.v1.account-a.goal-boards", "draft"], ["oddk.drafts.v1.account-a.reviews.recovery.1", "raw"],
    ["oddk.sync.plan.account-ab", "other"], ["oddk.drafts.v1.local.workspace", "local"],
    ["oddk.sync.session.v1", JSON.stringify({ id: "account-a" })], [DELETION_KEY, JSON.stringify({ userId: "account-a", operation })],
  ]);
  const storage = { get length() { return values.size; }, key: i => [...values.keys()][i] ?? null, getItem: key => values.get(key) ?? null, removeItem: key => values.delete(key) };
  eraseAccountData(storage, "account-a");
  assert.deepEqual([...values.keys()].sort(), ["oddk.todo.v1", "oddk.sync.plan.account-ab", "oddk.drafts.v1.local.workspace", DELETION_KEY].sort());
  assert.equal(pendingDeletion(storage).userId, "account-a");
  values.set(DELETION_KEY, "malformed");
  assert.throws(() => pendingDeletion(storage));
});
