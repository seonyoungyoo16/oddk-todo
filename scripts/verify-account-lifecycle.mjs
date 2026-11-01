// Read-only production checks. This script never sends a confirmed delete.
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
const url = "https://synxmskamifpovuziecx.supabase.co";
const key = "sb_publishable_ACwZjSLbL_dU9hilmAV7CQ_FEH8AT29";
const endpoint = `${url}/functions/v1/account-lifecycle`;
const operation = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex");
async function request(body, token, path = "") {
  const response = await fetch(endpoint + path, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  return { status: response.status, data: await response.json() };
}
assert.equal((await request({ action: "capabilities" })).status, 200);
assert.deepEqual((await request({ action: "status", operation })).data, { state: "unknown" });
assert.equal((await request({ action: "delete", operation, confirmation: "DELETE_ACCOUNT" })).status, 401);
assert.equal((await request({ payload: "forged" }, undefined, "/apple-notifications")).status >= 400, true);
const credentialFile = new URL("../.sync-auth-fixture.json", import.meta.url);
if (existsSync(credentialFile)) {
  const [credentials] = JSON.parse(readFileSync(credentialFile, "utf8"));
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const auth = await client.auth.signInWithPassword(credentials);
  assert.equal(auth.error, null, "Dedicated fixture login failed");
  const token = auth.data.session.access_token;
  async function digestPlan() {
    const response = await fetch(`${url}/functions/v1/plan-sync`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ action: "pull" }) });
    assert.equal(response.status, 200);
    return createHash("sha256").update(JSON.stringify(await response.json())).digest("hex");
  }
  const before = await digestPlan();
  assert.equal((await request({ action: "delete", operation, confirmation: "" }, token)).status, 400);
  assert.equal((await request({ action: "delete", operation, confirmation: "DELETE_ACCOUNT", userId: crypto.randomUUID() }, token)).status, 400);
  assert.equal((await request({ action: "apple-token", refreshToken: "synthetic-refresh-token" }, token)).status, 403);
  assert.equal(await digestPlan(), before, "Account data changed during rejection tests");
  await client.auth.signOut({ scope: "local" });
  console.log("Authenticated rejection checks passed; dedicated account plan digest unchanged.");
}
console.log("Live capabilities, deletion authentication, receipt privacy and forged webhook checks passed. No account was deleted.");
