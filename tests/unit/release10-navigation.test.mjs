import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import postcss from "postcss";

const source = readFileSync(new URL("../../app/todo/mobile-navigation.tsx", import.meta.url), "utf8");
const element = (type, props) => ({ type, props });
const descendants = node => !node || typeof node !== "object" ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(descendants)];
const label = node => typeof node === "string" ? node : typeof node === "number" ? String(node) : node && typeof node === "object" ? [node.props?.children].flat(Infinity).map(label).join("") : "";

function navigation() {
  const win = new EventTarget(), viewport = new EventTarget(), doc = new EventTarget();
  Object.assign(win, { innerHeight: 844, innerWidth: 390, visualViewport: viewport }); viewport.height = 844;
  doc.activeElement = { matches: () => false };
  const subscriptions = [], removed = [];
  for (const target of [win, viewport, doc]) {
    const add = target.addEventListener.bind(target), remove = target.removeEventListener.bind(target);
    target.addEventListener = (type, handler) => { subscriptions.push([target, type, handler]); add(type, handler); };
    target.removeEventListener = (type, handler) => { removed.push([target, type, handler]); remove(type, handler); };
  }
  const frames = new Map(), state = [], exports = {}; let cursor = 0, effectRun = false, cleanup, frameId = 0;
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { exports, window: win, document: doc,
    requestAnimationFrame(fn) { const id = ++frameId; frames.set(id, fn); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    require(name) {
      if (name === "react") return {
        useState(initial) { const index = cursor++; if (!(index in state)) state[index] = initial; return [state[index], next => { state[index] = next; }]; },
        useEffect(fn) { if (!effectRun) { effectRun = true; cleanup = fn(); } },
      };
      if (name === "react/jsx-runtime") return { jsx: element, jsxs: element };
      if (name.startsWith("react-icons/")) return {};
      throw Error(name);
    },
  });
  const calls = [];
  const render = (current = "day") => { cursor = 0; return exports.MobileNavigation({ current, onNavigate: value => calls.push(value) }); };
  return { exports, calls, win, viewport, doc, subscriptions, removed, frames, render,
    flush() { const queued = [...frames.values()]; frames.clear(); queued.forEach(fn => fn()); },
    unmount() { cleanup?.(); },
  };
}

test("bottom navigation exposes exactly day, goals, settings and invokes each real destination callback", () => {
  const h = navigation(), tree = h.render(), buttons = descendants(tree).filter(n => n.type === "button");
  assert.deepEqual(buttons.map(label), ["하루계획", "목표추적", "환경설정"]);
  for (const button of buttons) button.props.onClick();
  assert.deepEqual(h.calls, ["day", "mandala", "settings"]);
  assert.equal(h.exports.workspaceDestinations.length, 5);
  assert.deepEqual(Array.from(h.exports.workspaceDestinations, item => item.id), ["day", "mandala", "history", "settings", "profile"]);
  assert.deepEqual(Array.from(h.exports.mobileDestinations, item => item.id), ["day", "mandala", "settings"]);
  h.unmount();
});

test("bottom active marker follows only its three destinations and never mislabels history or profile", () => {
  const h = navigation();
  for (const [current, expected] of [["day", "하루계획"], ["mandala", "목표추적"], ["settings", "환경설정"], ["history", null], ["profile", null]]) {
    const active = descendants(h.render(current)).filter(n => n.type === "button" && n.props["aria-current"] === "page");
    assert.equal(active.length, expected ? 1 : 0);
    if (expected) assert.equal(label(active[0]), expected);
  }
  h.unmount();
});

test("keyboard viewport changes still hide navigation and cleanup removes all event/frame subscriptions", () => {
  const h = navigation();
  assert.equal(h.render().props["data-keyboard-open"], false);
  h.doc.activeElement = { matches: () => true }; h.viewport.height = 560;
  h.viewport.dispatchEvent(new Event("resize")); h.flush();
  assert.equal(h.render().props["data-keyboard-open"], true);
  h.viewport.height = 844; h.viewport.dispatchEvent(new Event("resize")); h.flush();
  assert.equal(h.render().props["data-keyboard-open"], false);
  h.viewport.height = 500; h.doc.activeElement = { matches: () => false };
  h.doc.dispatchEvent(new Event("focusout")); h.flush();
  assert.equal(h.render().props["data-keyboard-open"], false);
  h.win.dispatchEvent(new Event("resize")); assert.equal(h.frames.size, 1);
  h.unmount(); assert.equal(h.frames.size, 0); assert.equal(h.removed.length, h.subscriptions.length);
  for (const entry of h.subscriptions) assert(h.removed.some(value => value.every((part, i) => part === entry[i])));
});

test("three-column CSS keeps mobile/tablet breakpoint, safe area, keyboard hiding and 44px targets", () => {
  const css = postcss.parse(readFileSync(new URL("../../app/todo/mobile-navigation.css", import.meta.url), "utf8"));
  const find = (selector, media) => {
    let value;
    css.walkRules(selector, rule => { if ((rule.parent.type === "atrule" ? rule.parent.params : "base") === media) value = Object.fromEntries(rule.nodes.filter(n => n.type === "decl").map(n => [n.prop, n.value])); });
    assert(value, selector + " under " + media); return value;
  };
  const nav = find(".oddk-page .oddk-mobileNavigation", "(max-width:1099px)");
  assert.equal(nav["grid-template-columns"], "repeat(3,minmax(0,1fr))");
  assert.equal(nav.position, "fixed"); assert.match(nav.height, /safe-area-inset-bottom/); assert.match(nav.padding, /safe-area-inset-bottom/);
  const button = find(".oddk-page .oddk-mobileNavigation > button", "(max-width:1099px)");
  assert.equal(button["min-width"], "44px"); assert.equal(button["min-height"], "44px"); assert.equal(button["font-size"], "13px");
  assert.equal(find('.oddk-page .oddk-mobileNavigation[data-keyboard-open="true"]', "(max-width:1099px)").display, "none");
  assert.equal(find(".oddk-mobileNavigation,.oddk-entryGuideMobile,.oddk-page .oddk-mobileAccount", "base").display, "none");
});
