import test from "node:test";
import assert from "node:assert/strict";
import { layoutTimeline, clockLabel } from "../../app/todo/timeline.ts";
test("adjacent intervals do not overlap; actual overlaps get separate columns", () => {
  const adjacent = layoutTimeline([{ id: "a", start: 540, end: 600 }, { id: "b", start: 600, end: 660 }]);
  assert.ok(adjacent.items.every((item) => !item.conflict && item.columns === 1));
  const overlap = layoutTimeline([{ id: "a", start: 540, end: 610 }, { id: "b", start: 600, end: 660 }]);
  assert.ok(overlap.items.every((item) => item.conflict && item.columns === 2));
  assert.notEqual(overlap.items[0].lane, overlap.items[1].lane);
});
test("cross-midnight intervals remain one continuous event and label next day", () => {
  const result = layoutTimeline([{ id: "late", start: 1410, end: 1470 }]);
  assert.equal(result.items.length, 1); assert.equal(result.items[0].end, 1470);
  assert.equal(clockLabel(1470), "다음 날 00:30"); assert.equal(clockLabel(1410), "23:30");
});
