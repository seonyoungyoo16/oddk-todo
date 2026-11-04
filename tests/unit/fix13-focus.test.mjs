import test from "node:test";
import assert from "node:assert/strict";
import { openDialogWithFocus, restoreDialogFocus, keepFocusInDialog } from "../../app/todo/dialog-focus.ts";

function fixture({ mobile = true, native = false } = {}) {
  const events = [], doc = { documentElement: { getAttribute: () => native ? "locked" : null }, defaultView: { matchMedia: () => ({ matches: mobile }) }, activeElement: null };
  const attrs = new Map();
  const heading = { ownerDocument: doc, tabIndex: -1, isConnected: true, getAttribute: key => attrs.get(key) ?? null, setAttribute: (key, value) => attrs.set(key, value), removeAttribute: key => attrs.delete(key), focus(options) { events.push(["heading", options]); doc.activeElement = this; } };
  const input = { ownerDocument: doc, isConnected: true, getClientRects: () => [1], matches: () => true, focus(options) { events.push(["input", options]); doc.activeElement = this; } };
  doc.querySelector = () => heading;
  const dialog = { ownerDocument: doc, open: false, querySelector: () => heading, showModal() { events.push(["show", attrs.has("autofocus")]); this.open = true; } };
  return { events, doc, input, heading, dialog, attrs };
}

test("mobile and wide native dialogs select a non-editing autofocus target before showModal; desktop retains editor focus", () => {
  for (const config of [{ mobile: true }, { mobile: false, native: true }]) {
    const h = fixture(config); openDialogWithFocus(h.dialog, h.input);
    assert.deepEqual(h.events.map(event => event[0]), ["show", "heading"]);
    assert.equal(h.events[0][1], true); assert.equal(h.attrs.has("autofocus"), false);
    assert.equal(h.events[1][1].preventScroll, true);
  }
  const desktop = fixture({ mobile: false }); openDialogWithFocus(desktop.dialog, desktop.input);
  assert.deepEqual(desktop.events.map(event => event[0]), ["show", "input"]);
});

test("mobile close avoids a fresh input keyboard, preserves an already active editor, and desktop restores the opener", () => {
  const h = fixture(); restoreDialogFocus(h.input);
  assert.deepEqual(h.events.map(event => event[0]), ["heading"]);
  h.events.length = 0; h.doc.activeElement = h.input; restoreDialogFocus(h.input); assert.deepEqual(h.events, []);
  const desktop = fixture({ mobile: false }); restoreDialogFocus(desktop.input);
  assert.deepEqual(desktop.events.map(event => event[0]), ["input"]);
});

test("manual keyboard traversal still reaches editing controls and never blurs or suppresses typing", () => {
  const h = fixture(), button = { tabIndex: 0, getClientRects: () => [1], focus() { h.events.push(["button"]); } };
  Object.assign(h.input, { tabIndex: 0 });
  const dialog = { ownerDocument: h.doc, querySelectorAll: () => [h.input, button] };
  h.doc.activeElement = button; let prevented = false;
  keepFocusInDialog({ key: "Tab", shiftKey: false, currentTarget: dialog, preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.equal(h.doc.activeElement, h.input);
  h.doc.activeElement = h.input; keepFocusInDialog({ key: "Tab", shiftKey: true, currentTarget: dialog, preventDefault() {} });
  assert.equal(h.events.at(-1)[0], "button");
});
