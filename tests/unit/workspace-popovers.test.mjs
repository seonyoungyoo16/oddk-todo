import test from "node:test";
import assert from "node:assert/strict";
import { closeWorkspacePopovers, installWorkspacePopovers } from "../../app/todo/workspace-popovers.ts";
import { readFileSync } from "node:fs";
import postcss from "postcss";

function fixture() {
  const doc = new EventTarget(), inside = {}, outside = {}, draft = { text: "보존할 목표 초안", selected: "goal-2" };
  let focuses = 0, modal = false;
  const menu = { open: true, contains: target => target === inside, querySelector: () => ({ focus: () => focuses++ }) };
  const accordion = { open: true };
  const root = { ownerDocument: doc, querySelectorAll: selector => selector.includes("oddk-goalManagement") && menu.open ? [menu] : [], querySelector: () => modal ? {} : null };
  const dispatch = (type, target, key) => { const event = new Event(type, { cancelable: true }); Object.defineProperty(event, "target", { value: target }); Object.defineProperty(event, "key", { value: key }); doc.dispatchEvent(event); return event; };
  return { root, menu, accordion, draft, inside, outside, dispatch, get focuses() { return focuses; }, setModal(value) { modal = value; } };
}

test("outside pointer/focus dismisses menus, inside input does not; drafts and accordions survive", () => {
  const h = fixture(), original = JSON.stringify(h.draft), dispose = installWorkspacePopovers(h.root);
  h.dispatch("pointerdown", h.inside); assert.equal(h.menu.open, true);
  h.dispatch("pointerdown", h.outside); assert.equal(h.menu.open, false);
  h.menu.open = true; h.dispatch("focusin", h.outside); assert.equal(h.menu.open, false);
  assert.equal(h.accordion.open, true); assert.equal(JSON.stringify(h.draft), original);
  dispose(); h.menu.open = true; h.dispatch("pointerdown", h.outside); assert.equal(h.menu.open, true);
});

test("Escape returns focus; a modal owns Escape; navigation closes transient menus only", () => {
  const h = fixture(), dispose = installWorkspacePopovers(h.root);
  h.setModal(true); h.dispatch("keydown", h.inside, "Escape"); assert.equal(h.menu.open, true);
  h.setModal(false); assert.equal(h.dispatch("keydown", h.inside, "Escape").defaultPrevented, true);
  assert.equal(h.menu.open, false); assert.equal(h.focuses, 1);
  h.menu.open = true; closeWorkspacePopovers(h.root);
  assert.equal(h.menu.open, false); assert.equal(h.draft.selected, "goal-2"); assert.equal(h.accordion.open, true);
  dispose();
});

test("retained inactive view panels and closed menus have explicit author-level hiding rules", () => {
  const read = file => readFileSync(new URL(`../../app/todo/${file}`, import.meta.url), "utf8");
  const rules = [];
  postcss.parse(read("workspace-layout.css")).walkRules(rule => { if (rule.nodes.some(node => node.prop === "display" && node.value === "none")) rules.push(rule.selector); });
  assert(rules.includes(".oddk-page .oddk-pageBody [data-workspace-panel][hidden]"));
  assert(rules.some(selector => selector.includes(".oddk-goalManagement:not([open]) > .oddk-goalManagementPopover")));
  const page = read("page.tsx");
  for (const name of ["composer", "planning", "timetable", "tasks", "goals", "settings"]) assert(page.includes(`data-workspace-panel="${name}"`));
  assert.match(page, /data-workspace-panel="goals" hidden=\{view !== "mandala"\}/);
  assert.match(page, /data-workspace-panel="settings"[^>]+hidden=\{view !== "settings"\}/);
});
