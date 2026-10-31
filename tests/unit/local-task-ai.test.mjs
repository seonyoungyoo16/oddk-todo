import test from "node:test";
import assert from "node:assert/strict";
import { splitWithLocalAI, taskSplitRequest } from "../../app/todo/local-task-ai.ts";
const signal = () => new AbortController().signal;

test("semantic requests use a local generative model, strict schema and separate untrusted user text", () => {
  const source = '운동하고 장 보고 메일 보내기';
  const body = taskSplitRequest(source);
  assert.equal(body.model, 'qwen3:4b'); assert.equal(body.think, false); assert.equal(body.stream, false);
  assert.deepEqual(body.messages[1], { role: 'user', content: source });
  assert.equal(body.format.properties.titles.maxItems, 32);
  for (const text of ['', '  ', 'x'.repeat(2001)]) assert.throws(() => taskSplitRequest(text));
});
test("valid completed local responses become candidates without writing plan data", async () => {
  let called = false;
  const titles = await splitWithLocalAI('운동하고 장 보기', signal(), 'localhost', async (url, init) => {
    called = true; assert.equal(url, 'http://127.0.0.1:11434/api/chat'); assert.equal(init.method, 'POST');
    return Response.json({ done: true, done_reason: 'stop', message: { content: JSON.stringify({ titles: ['운동하기', '장보기'] }) } });
  });
  assert.equal(called, true); assert.deepEqual(titles, ['운동하기', '장보기']);
});
test("public origins never call the user's local Ollama and invalid/truncated replies never become tasks", async () => {
  let calls = 0;
  const fetcher = async () => { calls++; return Response.json({}); };
  await assert.rejects(splitWithLocalAI('운동', signal(), 'example.com', fetcher), /로컬 앱/); assert.equal(calls, 0);
  for (const body of [
    { done: false, message: { content: '{"titles":["운동"]}' } },
    { done: true, done_reason: 'length', message: { content: '{"titles":["운동"]}' } },
    { done: true, message: { content: '{"titles":[]}' } },
    { done: true, message: { content: '{"titles":[42]}' } },
    { done: true, message: { content: 'not-json' } },
  ]) await assert.rejects(splitWithLocalAI('운동', signal(), 'localhost', async () => Response.json(body)));
  await assert.rejects(splitWithLocalAI('운동', signal(), 'localhost', async () => new Response(null, { status: 404 })), /모델/);
});
