import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createGateway, authenticate, generateTitles } from "../../scripts/ollama-gateway.mjs";
import { splitWithRemoteAI, TASK_AI_ENDPOINT } from "../../app/todo/remote-task-ai.ts";

async function fixture(t, options) {
  const server = createGateway(options).listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  return `http://127.0.0.1:${server.address().port}`;
}
const headers = { Authorization: `Bearer ${"valid-token-".repeat(3)}`, "Content-Type": "application/json", Origin: "https://seonyoungyoo16.github.io" };
test("public gateway rejects unauthenticated, foreign-origin and arbitrary Ollama requests", async t => {
  let calls = 0;
  const base = await fixture(t, { verify: async () => null, generate: async () => { calls++; return []; } });
  assert.equal((await fetch(`${base}/health`)).status, 200);
  assert.equal((await fetch(`${base}/api/chat`, { method: "POST" })).status, 404);
  assert.equal((await fetch(`${base}/split`, { method: "POST" })).status, 401);
  assert.equal((await fetch(`${base}/split`, { method: "POST", headers })).status, 401);
  assert.equal((await fetch(`${base}/split`, { method: "POST", headers: { ...headers, Origin: "https://evil.example" } })).status, 403);
  const cors = await fetch(`${base}/split`, { method: "OPTIONS", headers });
  assert.equal(cors.status, 204); assert.equal(cors.headers.get("access-control-allow-origin"), headers.Origin);
  assert.equal(calls, 0);
});
test("verified users can only submit bounded text, with per-user throttling", async t => {
  const inputs = [];
  const base = await fixture(t, { verify: async () => "user-a", generate: async text => { inputs.push(text); return ["운동하기", "장보기"]; } });
  const send = body => fetch(`${base}/split`, { method: "POST", headers, body: JSON.stringify(body) });
  assert.equal((await send({ text: "운동", model: "other" })).status, 400);
  assert.equal((await send({ text: "가".repeat(2001) })).status, 400);
  assert.equal((await send({ text: "가".repeat(10001) })).status, 413);
  const result = await send({ text: "운동하고 장보기" });
  assert.equal(result.status, 200); assert.deepEqual(await result.json(), { titles: ["운동하기", "장보기"] });
  for (let i = 0; i < 9; i++) assert.equal((await send({ text: "운동" })).status, 200);
  assert.equal((await send({ text: "운동" })).status, 429); assert.equal(inputs.length, 10);
});
test("concurrent inference is rejected and an inference failure releases the slot", async t => {
  let release;
  const held = new Promise(resolve => { release = resolve; });
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  let first = true;
  const base = await fixture(t, { verify: async () => "user-a", generate: async () => { if (first) { first = false; entered(); await held; throw Error("private detail"); } return ["운동"]; } });
  const send = () => fetch(`${base}/split`, { method: "POST", headers, body: JSON.stringify({ text: "운동" }) });
  const initial = send(); await started;
  assert.equal((await send()).status, 429);
  release(); const failed = await initial; assert.equal(failed.status, 503); assert.doesNotMatch(await failed.text(), /private detail/);
  assert.equal((await send()).status, 200);
});
test("auth is checked against Supabase and anonymous accounts are denied", async () => {
  assert.equal(await authenticate("token", async (url, init) => { assert.match(url, /supabase.co\/auth\/v1\/user$/); assert.equal(init.headers.Authorization, "Bearer token"); return Response.json({ id: "id", role: "authenticated", is_anonymous: false }); }), "id");
  assert.equal(await authenticate("token", async () => Response.json({ id: "id", role: "authenticated", is_anonymous: true })), null);
  assert.equal(await authenticate("token", async () => new Response(null, { status: 401 })), null);
});
test("gateway builds its own model prompt and rejects incomplete model output", async () => {
  const titles = await generateTitles("운동하고 장보기", new AbortController().signal, async (url, init) => {
    assert.equal(url, "http://127.0.0.1:11434/api/chat"); assert.equal(JSON.parse(init.body).model, "qwen3:4b");
    return Response.json({ done: true, message: { content: '{"titles":["운동","장보기"]}' } });
  });
  assert.deepEqual(titles, ["운동", "장보기"]);
  await assert.rejects(generateTitles("운동", new AbortController().signal, async () => Response.json({ done: false })));
});
test("deployed client requires login, sends only text over HTTPS and preserves server errors", async () => {
  const signal = new AbortController().signal;
  await assert.rejects(splitWithRemoteAI("운동", signal, null), /로그인/);
  assert.deepEqual(await splitWithRemoteAI("운동", signal, "jwt", async (url, init) => {
    assert.equal(url, TASK_AI_ENDPOINT); assert.match(url, /^https:/); assert.deepEqual(JSON.parse(init.body), { text: "운동" }); assert.equal(init.headers.Authorization, "Bearer jwt");
    return Response.json({ titles: ["운동"] });
  }), ["운동"]);
  await assert.rejects(splitWithRemoteAI("운동", signal, "jwt", async () => Response.json({ error: "다시 로그인해주세요." }, { status: 401 })), /다시 로그인/);
  await assert.rejects(splitWithRemoteAI("운동", signal, "jwt", async () => { throw Error("offline"); }), /원문은 유지/);
});
