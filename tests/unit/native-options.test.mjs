import test from "node:test";
import assert from "node:assert/strict";
import { nativeAuthCallback, NATIVE_AUTH_REDIRECT, createNativeAuthHandler, usesLocalTaskAI } from "../../app/todo/native-options.ts";

test("a phone's localhost never selects the PC-only AI endpoint", () => {
  for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
    assert.equal(usesLocalTaskAI(host, false), true);
    assert.equal(usesLocalTaskAI(host, true), false);
  }
  assert.equal(usesLocalTaskAI("example.com", false), false);
});
test("only the app's exact auth callback accepts a PKCE code and optional flow ID", () => {
  assert.deepEqual(nativeAuthCallback(`${NATIVE_AUTH_REDIRECT}?code=one&sb_flow_id=flow`), { code: "one", flowId: "flow" });
  for (const url of ["invalid", "https://auth/callback?code=one", "com.oddk.todo://evil/callback?code=one", "com.oddk.todo://auth/other?code=one", "com.oddk.todo://user@auth/callback?code=one", "com.oddk.todo://auth:443/callback?code=one", `${NATIVE_AUTH_REDIRECT}#access_token=secret`]) assert.equal(nativeAuthCallback(url), null);
  for (const query of ["", "?code=", "?code=one&code=two", "?error=denied&error_description=untrusted", "?code=one&sb_flow_id=", "?code=one&sb_flow_id=a&sb_flow_id=b"]) assert.deepEqual(nativeAuthCallback(`${NATIVE_AUTH_REDIRECT}${query}`), { error: true });
});
test("warm and cold launch callbacks exchange once and ignore unrelated links", async () => {
  const calls = [];
  const handler = createNativeAuthHandler(async (...args) => { calls.push(args); });
  assert.equal(await handler("https://example.com"), false);
  await Promise.all([handler(`${NATIVE_AUTH_REDIRECT}?code=one&sb_flow_id=flow`), handler(`${NATIVE_AUTH_REDIRECT}?code=one&sb_flow_id=flow`)]);
  assert.deepEqual(calls, [["one", "flow"]]);
  await assert.rejects(handler(`${NATIVE_AUTH_REDIRECT}?error=access_denied`), /로그인/);
  assert.equal(calls.length, 1);
});
test("failed code exchange is surfaced without exposing the code", async () => {
  const handler = createNativeAuthHandler(async () => { throw Error("connection failed"); });
  await assert.rejects(handler(`${NATIVE_AUTH_REDIRECT}?code=one`), /connection failed/);
});
