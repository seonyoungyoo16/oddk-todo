import test from "node:test";
import assert from "node:assert/strict";
import { validAvailabilityDrafts } from "../../app/todo/availability-draft.ts";
import { saveDraft, decodeDraft, draftKey } from "../../app/todo/draft-store.ts";
const base = { start: "09:00", end: "18:00", fixed: [] };
test("partial availability inputs persist separately for each date and account", () => {
  const entries = new Map(), storage = { getItem: k => entries.get(k) ?? null, setItem: (k, v) => entries.set(k, v) };
  const value = { "2026-10-28": { base, value: { ...base, end: "", fixed: [{ id: "lunch", title: "Lunch", start: "12:00", end: "" }] } }, "2026-10-29": { base, value: { start: "10:00", end: "19:00", fixed: [] } } };
  saveDraft(storage, "account-a", "availability", value, validAvailabilityDrafts);
  assert.deepEqual(decodeDraft(storage.getItem(draftKey("account-a", "availability")), validAvailabilityDrafts).data, value);
  assert.equal(storage.getItem(draftKey("account-b", "availability")), null); assert.equal(storage.getItem(draftKey("local", "availability")), null);
});
test("invalid bases and duplicated fixed IDs never replace a valid availability draft", () => {
  const valid = { "2026-10-28": { base, value: base } };
  assert.equal(validAvailabilityDrafts(valid), true);
  assert.equal(validAvailabilityDrafts({ "2026-02-30": { base, value: base } }), false);
  assert.equal(validAvailabilityDrafts({ "2026-10-28": { base: { ...base, end: "08:00" }, value: base } }), false);
  assert.equal(validAvailabilityDrafts({ "2026-10-28": { base, value: { ...base, fixed: Array(2).fill({ id: "same", title: "", start: "", end: "" }) } } }), false);
  assert.equal(validAvailabilityDrafts({ "2026-10-28": { base, value: { ...base, fixed: [{ id: "a", title: "x".repeat(61), start: "", end: "" }] } } }), false);
});
