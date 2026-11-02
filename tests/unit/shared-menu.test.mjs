import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import postcss from "postcss";
import { openFullMenuSession } from "../../app/todo/full-menu-session.ts";

function fixture({ denyHistory = false } = {}) {
  const win = new EventTarget(), events = [];
  let state = { __NA: true, tree: { preserved: true } }, oldState, pending = 0;
  Object.assign(win, { location: { href: "http://localhost:3000/todo/#main" }, scrollX: 3, scrollY: 420,
    scrollTo(value) { this.scrollX = value.left; this.scrollY = value.top; events.push("scroll"); },
    history: { get state() { return state; }, pushState(value) { if (denyHistory) throw Error("restricted"); oldState = state; state = value; events.push("push"); }, back() { pending++; events.push("back"); } } });
  const style = { overflow: "auto", position: "relative", top: "2px", left: "4px", right: "", width: "90%" };
  const originalStyle = { ...style };
  const doc = { defaultView: win, body: { style }, documentElement: { style: { overflow: "visible" } } };
  const trigger = { isConnected: true, focus() { events.push("trigger-focus"); } };
  const dialog = { ownerDocument: doc, open: false, showModal() { this.open = true; }, close() { this.open = false; }, querySelector() { return { focus() { events.push("close-focus"); } }; } };
  const session = openFullMenuSession({ dialog, trigger, onClosed() { events.push("closed"); } });
  return { win, doc, dialog, session, events, originalStyle, flushBack() { assert(pending > 0); pending--; state = oldState; win.dispatchEvent(new Event("popstate")); } };
}

test("menu opens a modal and one history entry while preserving router state and locking the original body", () => {
  const h = fixture();
  assert.equal(h.dialog.open, true); assert.equal(h.doc.body.style.position, "fixed"); assert.equal(h.doc.body.style.top, "-420px");
  assert.equal(h.doc.documentElement.style.overflow, "hidden"); assert.deepEqual(h.win.history.state.tree, { preserved: true });
  assert.equal(h.events.filter(x => x === "push").length, 1); assert(h.events.includes("close-focus"));
  h.session.close(); h.flushBack();
});

test("close/current-page selection restores scroll, exact styles and trigger focus once before any optional action", () => {
  const h = fixture(); h.win.scrollY = 0;
  h.session.close(() => h.events.push("navigate")); h.session.close(() => h.events.push("duplicate"));
  assert.equal(h.dialog.open, true, "keep the modal until its own history pop completes");
  h.flushBack();
  assert.equal(h.dialog.open, false); assert.deepEqual(h.doc.body.style, h.originalStyle);
  assert.equal(h.doc.documentElement.style.overflow, "visible"); assert.equal(h.win.scrollY, 420);
  assert.equal(h.events.filter(x => x === "back").length, 1); assert.equal(h.events.filter(x => x === "closed").length, 1);
  assert(h.events.indexOf("closed") < h.events.indexOf("navigate")); assert(!h.events.includes("duplicate"));
});

test("browser Back closes the menu without pushing navigation or adding a second back", () => {
  const h = fixture(); h.win.history.back(); h.flushBack();
  assert.equal(h.dialog.open, false); assert.equal(h.events.filter(x => x === "back").length, 1);
  assert.equal(h.events.filter(x => x === "closed").length, 1);
});

test("unmount during a pending close cannot pop two entries or call a stale navigation callback", () => {
  const h = fixture(); h.session.close(() => h.events.push("stale")); h.session.dispose(); h.flushBack();
  assert.equal(h.events.filter(x => x === "back").length, 1); assert(!h.events.includes("stale"));
  assert(!h.events.includes("closed")); assert.deepEqual(h.doc.body.style, h.originalStyle);
});

test("unmount cleans an owned entry, but never navigates back from a newly opened different URL", () => {
  const h = fixture(); h.session.dispose(); assert.equal(h.events.filter(x => x === "back").length, 1); h.flushBack();
  assert(!h.events.includes("closed"));
  const external = fixture(); external.win.location.href = "http://localhost:3000/"; external.session.dispose();
  assert(!external.events.includes("back")); assert.deepEqual(external.doc.body.style, external.originalStyle);
});

test("restricted browser history still closes normally and restores body/scroll", () => {
  const h = fixture({ denyHistory: true }); h.session.close();
  assert.equal(h.dialog.open, false); assert.deepEqual(h.doc.body.style, h.originalStyle); assert(!h.events.includes("back"));
  assert.equal(h.events.filter(x => x === "closed").length, 1);
});

const element = (type, props) => ({ type, props });
function nodes(n) { return !n || typeof n !== "object" ? [] : [n, ...[n.props?.children].flat(Infinity).flatMap(nodes)]; }
function header(current = "day", actions) {
  const state = [], refs = [], calls = [], exports = {}; let s, r, options;
  const destinations = ["day", "mandala", "history", "settings", "profile"].map((id, i) => ({ id, label: ["하루계획", "목표추적", "작업이력", "환경설정", "내정보"][i], Icon: () => null }));
  const code = ts.transpileModule(readFileSync(new URL("../../app/todo/shared-header.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { exports, process: { env: {} }, requestAnimationFrame: fn => fn(), document: { getElementById: () => ({ focus() { calls.push("heading"); } }) }, require(name) {
    if (name === "react") return { useState(initial) { const i = s++; if (!(i in state)) state[i] = initial; return [state[i], value => { state[i] = value; }]; }, useRef: initial => refs[r++] ??= { current: initial }, useEffect() {} };
    if (name === "react/jsx-runtime") return { jsx: element, jsxs: element };
    if (name === "./mobile-navigation") return { workspaceDestinations: destinations };
    if (name === "./full-menu-session") return { openFullMenuSession(value) { options = value; calls.push("open"); return { close(after) { calls.push("close"); options.onClosed(); after?.(); }, dispose() {} }; } };
    if (name === "./dialog-focus") return { keepFocusInDialog() {} };
    if (name === "next/image") return { default: "img" };
    if (name === "next/link") return { default: "a" };
    if (name === "react-icons/hi2") return {};
    throw Error(name);
  } });
  const render = () => { s = 0; r = 0; const tree = exports.SharedHeader({ current, actions, onNavigate: id => calls.push(id) }); refs[0].current = {}; refs[1].current = {}; return tree; };
  const open = () => nodes(render()).find(n => n.props?.["aria-label"] === "전체 메뉴 열기").props.onClick();
  return { render, open, calls, sidebar: () => exports.DesktopSidebar({ current, onNavigate: id => calls.push(id) }) };
}

test("all five destinations have one active menu row; choosing the current page only closes and cannot reset its scroll", () => {
  for (const current of ["day", "mandala", "history", "settings", "profile"]) {
    const h = header(current); h.open(); const tree = nodes(h.render());
    const nav = tree.find(n => n.props?.className === "oddk-fullMenuLinks"), rows = nav.props.children;
    assert.equal(rows.length, 5); assert.equal(rows.filter(row => row.props["aria-current"] === "page").length, 1);
    assert.equal(tree.filter(n => n.props?.className === "oddk-sharedProfile").length, 0);
    rows.find(row => row.props["aria-current"] === "page").props.onClick();
    assert.deepEqual(h.calls, ["open", "close"]);
  }
});

test("destination selection closes first, then uses the existing navigation callback and focuses its title", () => {
  const h = header(); h.open();
  const rows = nodes(h.render()).find(n => n.props?.className === "oddk-fullMenuLinks").props.children;
  rows[1].props.onClick(); assert.deepEqual(h.calls, ["open", "close", "mandala", "heading"]);
});

test("Escape cancellation and profile reuse close only the menu before invoking the existing profile flow", () => {
  const h = header(); h.open(); const dialog = nodes(h.render()).find(n => n.type === "dialog"); let prevented = false;
  dialog.props.onCancel({ preventDefault() { prevented = true; } }); assert(prevented); assert.deepEqual(h.calls, ["open", "close"]);
  const profile = header(); profile.open();
  const rows = nodes(profile.render()).find(n => n.props?.className === "oddk-fullMenuLinks").props.children;
  rows[4].props.onClick();
  assert.deepEqual(profile.calls, ["open", "close", "profile"]);
});

test("all five current destinations have one top H1, no logo, and retain the workspace title focus target", () => {
  const labels = { day: "하루계획", mandala: "목표추적", history: "작업이력", settings: "환경설정", profile: "내정보" };
  for (const [current, label] of Object.entries(labels)) {
    const tree = nodes(header(current).render()), top = tree.find(n => n.type === "header");
    const titles = tree.filter(n => n.type === "h1");
    assert.equal(titles.length, 1); assert.equal(titles[0].props.children, label);
    assert.equal(titles[0].props.id, "workspace-title"); assert.equal(titles[0].props.tabIndex, -1);
    assert(nodes(top).includes(titles[0]));
    assert(!tree.some(n => n.type === "img" || n.type === "a" || n.props?.className === "oddk-sharedBrand"));
  }
  const page = readFileSync(new URL("../../app/todo/page.tsx", import.meta.url), "utf8");
  assert.match(page, /<main className="oddk-workspace" aria-labelledby="workspace-title">/);
  assert.doesNotMatch(page, /WorkspaceHeader|headerDescription|oddk-pageDescription/);
  assert.match(page, /id="todo-add-target" className="oddk-addTarget oddk-srOnly"/);
  assert.match(page, /<DailyDateControl date=/);
  assert.match(page, /dayLabel\(planDate\)/);
});

test("open menu title occupies the close-button bar once; existing theme action remains available after close", () => {
  let toggles = 0;
  const action = element("button", { className: "oddk-themeToggle", onClick: () => { toggles++; }, "aria-label": "다크 모드로 전환" });
  const h = header("day", action); h.open();
  const tree = nodes(h.render()), dialog = tree.find(n => n.type === "dialog");
  const title = nodes(dialog).filter(n => n.props?.id === "workspace-menu-title");
  assert.equal(title.length, 1); assert.equal(title[0].props.children, "전체 메뉴");
  const bar = nodes(dialog).find(n => n.props?.className === "oddk-sharedHeaderInner");
  assert(nodes(bar).includes(title[0]));
  const body = nodes(dialog).find(n => n.props?.className === "oddk-fullMenuBody");
  assert(!nodes(body).some(n => n.type === "h1" || n.type === "h2"));
  nodes(bar).find(n => n.props?.["data-menu-close"] === "true").props.onClick();
  const actions = nodes(h.render()).find(n => n.props?.className === "oddk-sharedHeaderActions");
  actions.props.children.props.onClick(); assert.equal(toggles, 1);
});

test("restored desktop sidebar shares all five active destinations and profile entry without resetting the current view", () => {
  for (const current of ["day", "mandala", "history", "settings", "profile"]) {
    const h = header(current), sidebar = h.sidebar(), all = nodes(sidebar);
    assert.equal(sidebar.type, "aside"); assert.equal(sidebar.props["aria-label"], "PC 사이드바");
    const nav = all.find(n => n.type === "nav"), rows = nav.props.children;
    assert.equal(rows.length, 5); assert.equal(rows.filter(n => n.props["aria-current"] === "page").length, 1);
    rows.find(n => n.props["aria-current"] === "page").props.onClick(); assert.deepEqual(h.calls, []);
    if (current !== "profile") { rows[4].props.onClick(); assert.deepEqual(h.calls, ["profile"]); }
    assert.equal(all.filter(n => n.type === "a" && n.props.href === "/").length, 1);
    assert.equal(all.filter(n => n.type === "img" && n.props.className === "oddk-logo").length, 1);
  }
  const h = header(); nodes(h.sidebar()).find(n => n.type === "nav").props.children[1].props.onClick();
  assert.deepEqual(h.calls, ["mandala", "heading"]);
  const page = readFileSync(new URL("../../app/todo/page.tsx", import.meta.url), "utf8");
  assert.match(page, /DesktopSidebar current=\{accountDialogOpen \? "profile" : currentDestination\} onNavigate=\{navigateWorkspace\}/);
  assert.match(page, /<div className="oddk-sharedAccountHost"><SyncPanel/);
});

test("PC sidebar layout is scoped to min1100 while mobile sidebar stays hidden; overlays remain outside the sidebar", () => {
  const css = postcss.parse(readFileSync(new URL("../../app/todo/shared-header.css", import.meta.url), "utf8"));
  const rule = (selector, media) => {
    let found;
    css.walkRules(selector, r => { const parent = r.parent.type === "atrule" ? r.parent.params : "base"; if (parent === media) found = Object.fromEntries(r.nodes.filter(n => n.type === "decl").map(n => [n.prop, n.value])); });
    assert(found, selector + " in " + media); return found;
  };
  assert.equal(rule(".oddk-page .oddk-desktopSidebar", "base").display, "none");
  const pc = rule('.oddk-page[data-shared-shell="true"] .oddk-desktopSidebar', "(min-width:1100px)");
  assert.equal(pc.display, "flex"); assert.equal(pc.width, "var(--oddk-sidebar-width)"); assert.equal(pc.position, "fixed");
  assert.equal(rule('.oddk-page[data-shared-shell="true"]', "(min-width:1100px)")["padding-inline-start"], "var(--oddk-sidebar-width)");
  assert.equal(rule(".oddk-sharedHeader .oddk-sharedMenuToggle", "(min-width:1100px)").display, "none");
  assert.equal(rule(".oddk-sharedHeader > .oddk-sharedHeaderInner", "(min-width:1100px)")["grid-template-columns"], "minmax(0,1fr) 44px");
  assert.equal(rule(".oddk-page .oddk-sharedAccountHost > .oddk-accountFooter", "(min-width:1100px)").display, "grid");
  assert.equal(rule('.oddk-page[data-shared-shell="true"] .oddk-execution.oddk-executionDock', "(min-width:1100px)").left, "var(--oddk-sidebar-width)");
});
