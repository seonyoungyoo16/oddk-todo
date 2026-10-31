import test from "node:test";
import assert from "node:assert/strict";
import { shouldReviewTaskSplit } from "../../app/todo/task-split-decision.ts";

test("a model merging multiple actions into one cannot take the auto-save path", () => {
  for (const source of ["AI 검증용 책상을 정리하고 AI 검증용 테스트 메모를 작성하고 AI 검증용 물통을 씻기", "운동하기\n장보기", "메일 보내기 그리고 산책하기", "정리한 뒤 메일 보내기"]) {
    assert.equal(shouldReviewTaskSplit(source, [source]), true);
  }
});
test("a single action keeps immediate entry while multiple returned candidates require review", () => {
  for (const source of ["물 마시기", "우유와 달걀 사기", "프로젝트 보고서 작성하기"]) assert.equal(shouldReviewTaskSplit(source, [source]), false);
  assert.equal(shouldReviewTaskSplit("운동하고 장보기", ["운동하기", "장보기"]), true);
});
