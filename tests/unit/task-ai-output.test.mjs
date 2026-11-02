import test from "node:test";
import assert from "node:assert/strict";
import { parseTaskAIOutput } from "../../app/todo/task-ai-output.ts";
import { splitWithLocalAI } from "../../app/todo/local-task-ai.ts";
import { splitWithRemoteAI } from "../../app/todo/remote-task-ai.ts";
import { generateTitles } from "../../scripts/ollama-gateway.mjs";

const source = "오늘 운동은 하지 말고 청소하고 내일 제출할 보고서 작성하기";
const model = { titles: ["운동하지 않기", "청소하기", "내일 제출할 보고서 작성하기"] };
const expected = ["청소하기", "내일 제출할 보고서 작성하기"];

test("an explicitly excluded action cannot reappear as a negated task; real actions and conditions keep their order", () => {
  assert.deepEqual(parseTaskAIOutput(source, model), expected);
  assert.deepEqual(parseTaskAIOutput("집 청소는 하지 말고 물 마시기", { titles: ["집 청소하지 않기", "물 마시기"] }), ["물 마시기"]);
  assert.deepEqual(parseTaskAIOutput("담배 피우지 말고 산책하기", { titles: ["담배 피우지 않기", "산책하기"] }), ["산책하기"]);
});

test("standalone avoidance goals and unrelated negated goals are not discarded, nor are multi-object actions split", () => {
  assert.deepEqual(parseTaskAIOutput("야식 먹지 않기", { titles: ["야식 먹지 않기"] }), ["야식 먹지 않기"]);
  assert.deepEqual(parseTaskAIOutput("운동은 하지 말고 야식 먹지 않기", { titles: ["야식 먹지 않기"] }), ["야식 먹지 않기"]);
  assert.deepEqual(parseTaskAIOutput("거실과 주방 청소하고 우유와 달걀 사기", { titles: ["거실과 주방 청소하기", "우유와 달걀 사기"] }), ["거실과 주방 청소하기", "우유와 달걀 사기"]);
});

test("identical duplicate candidates are removed without inventing missing actions or accepting malformed output", () => {
  assert.deepEqual(parseTaskAIOutput("집 청소하고 집 청소하고 물 마시기", { titles: ["집 청소하기", "집 청소하기", "물 마시기"] }), ["집 청소하기", "물 마시기"]);
  for (const invalid of [{ titles: [] }, { titles: [42] }, { titles: ["운동하지 않기"] }]) assert.throws(() => parseTaskAIOutput(source, invalid));
});

test("local, gateway and remote client enforce the same source-grounded exclusion; filtering never saves data", async () => {
  const completed = () => Response.json({ done: true, message: { content: JSON.stringify(model) } });
  const signal = new AbortController().signal;
  assert.deepEqual(await splitWithLocalAI(source, signal, "localhost", async () => completed()), expected);
  assert.deepEqual(await generateTitles(source, signal, async () => completed()), expected);
  assert.deepEqual(await splitWithRemoteAI(source, signal, "synthetic-test-token", { assertCurrent() {} }, async () => Response.json(model)), expected);
});
