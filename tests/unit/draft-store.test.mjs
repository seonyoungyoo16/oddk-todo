import test from "node:test";
import assert from "node:assert/strict";
import { decodeDraft, draftKey, saveDraft, removeDraft } from "../../app/todo/draft-store.ts";
import { emptyWorkspace, validWorkspace, withoutEditor } from "../../app/todo/workspace-draft.ts";
function memory() {
  const values = new Map();
  return { values, getItem: k => values.get(k) ?? null, setItem: (k, v) => { values.set(k, v); }, removeItem: k => { values.delete(k); } };
}
test("drafts survive store reload and remain separated by account and slot", () => {
  const storage = memory();
  for (const scope of ["local", "account-a", "account-b"]) saveDraft(storage, scope, "workspace", { ...emptyWorkspace, input: scope }, validWorkspace);
  for (const scope of ["local", "account-a", "account-b"]) assert.equal(decodeDraft(storage.getItem(draftKey(scope, "workspace")), validWorkspace).data.input, scope);
  removeDraft(storage, "account-a", "workspace");
  assert.equal(storage.getItem(draftKey("account-a", "workspace")), null);
  assert.equal(decodeDraft(storage.getItem(draftKey("account-b", "workspace")), validWorkspace).data.input, "account-b");
  assert.equal(storage.getItem(draftKey("local", "reviews")), null);
});
test("corrupt or future drafts are never replaced with an empty draft", () => {
  for (const raw of ["{", JSON.stringify({ version: 1, data: emptyWorkspace, updatedAt: "not-a-time" }), JSON.stringify({ version: 99, data: emptyWorkspace, updatedAt: "future" }), JSON.stringify({ version: 1, data: { input: 1 }, updatedAt: "bad" })]) {
    const storage = memory(), key = draftKey("local", "workspace"); storage.setItem(key, raw);
    assert.throws(() => saveDraft(storage, "local", "workspace", emptyWorkspace, validWorkspace));
    assert.equal(storage.getItem(key), raw);
  }
});
test("quota failure leaves previous draft intact and retry saves the same pending value", () => {
  const storage = memory(); saveDraft(storage, "a", "workspace", emptyWorkspace, validWorkspace);
  const before = storage.getItem(draftKey("a", "workspace"));
  const pending = { ...emptyWorkspace, input: "not lost" };
  assert.throws(() => saveDraft({ ...storage, setItem() { throw new Error("quota"); } }, "a", "workspace", pending, validWorkspace));
  assert.equal(storage.getItem(draftKey("a", "workspace")), before);
  saveDraft(storage, "a", "workspace", pending, validWorkspace);
  assert.equal(decodeDraft(storage.getItem(draftKey("a", "workspace")), validWorkspace).data.input, "not lost");
});
test("editor drafts retain every field and cancellation removes only its target", () => {
  const goal = { goal: "Goal", areas: Array.from({ length: 8 }, () => ({ title: "", taskIds: Array(8).fill("") })) };
  const base = { id: "a", title: "Saved", minutes: 30, bufferMinutes: 5, startTime: "09:00", priority: "normal", done: false, plannedDate: "2026-10-28" };
  const editor = { base, baseMandala: goal, title: "Changed", work: "25", buffer: "5", start: "10:00", date: "2026-10-29", priority: "high", done: true, links: ["0:1"] };
  const draft = { ...emptyWorkspace, input: "Keep", editingId: "a", editors: { a: editor, b: { ...editor, base: { ...base, id: "b" } } }, mandalaDraft: goal, mandalaBase: goal };
  assert.equal(validWorkspace(draft), true);
  const storage = memory(); saveDraft(storage, "a", "workspace", draft, validWorkspace);
  assert.deepEqual(decodeDraft(storage.getItem(draftKey("a", "workspace")), validWorkspace).data, draft);
  const after = withoutEditor(draft, "a"); assert.equal(after.editingId, null); assert.equal(after.editors.a, undefined); assert.deepEqual(after.editors.b, draft.editors.b); assert.equal(after.input, "Keep");
  assert.equal(validWorkspace({ ...draft, editors: { a: { ...editor, links: ["99:99"] } } }), false);
});
test("date-range preferences preserve legacy drafts and survive reload without changing editor content", () => {
  const legacy = { ...emptyWorkspace, input: "Keep my draft", selectedDate: "2027-01-01" };
  delete legacy.range;
  assert.equal(validWorkspace(legacy), true);
  const storage = memory();
  for (const range of ["day", "week", "all"]) {
    saveDraft(storage, "local", "workspace", { ...legacy, range }, validWorkspace);
    const restored = decodeDraft(storage.getItem(draftKey("local", "workspace")), validWorkspace).data;
    assert.equal(restored.range, range); assert.equal(restored.input, legacy.input); assert.equal(restored.selectedDate, legacy.selectedDate);
  }
  const before = storage.getItem(draftKey("local", "workspace"));
  assert.throws(() => saveDraft(storage, "local", "workspace", { ...legacy, range: "unknown" }, validWorkspace));
  assert.equal(storage.getItem(draftKey("local", "workspace")), before);
});

test("stored review navigation remains readable without losing selected dates or pending task input", () => {
  const storage = memory(), pending = { ...emptyWorkspace, input: "Keep task input", view: "review", selectedDate: "2026-10-30" };
  saveDraft(storage, "local", "workspace", pending, validWorkspace);
  assert.deepEqual(decodeDraft(storage.getItem(draftKey("local", "workspace")), validWorkspace).data, pending);
  assert.equal(validWorkspace({ ...pending, view: "unknown" }), false);
});
