import assert from "node:assert/strict";
import { generateTitles } from "./ollama-gateway.mjs";
const cases = [
  ["AI 검증용 책상을 정리하고 AI 검증용 테스트 메모를 작성하고 AI 검증용 물통을 씻기", [/책상/, /메모/, /물통/]],
  ["운동하고 장 보고 메일 보내기", [/운동/, /장/, /메일/]],
  ["회의 자료 정리하고 팀원에게 메일 보낸 뒤 산책하기", [/회의/, /메일/, /산책/]],
  ["우유와 달걀 사기", [/우유.*달걀/]],
  ["물 마시기", [/물/]],
];
for (const [text, expected] of cases) {
  const titles = await generateTitles(text, AbortSignal.timeout(90000));
  assert.equal(titles.length, expected.length, `Wrong action count for: ${text}`);
  expected.forEach((pattern, index) => assert.match(titles[index], pattern));
  console.log(JSON.stringify({ text, titles, passed: true }));
}
console.log("PASS: actual Ollama action boundaries, repeated modifiers and single-action grouping.");
