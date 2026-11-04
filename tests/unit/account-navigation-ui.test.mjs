import * as dialogFocus from "../../app/todo/dialog-focus.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const element = (type, props) => ({ type, props });
function nodes(n) { return !n || typeof n !== "object" ? [] : [n, ...[n.props?.children].flat(Infinity).flatMap(nodes)]; }
function panel(connected, onShowProfile) {
  const refs = [], effects = [], changes = [], writes = [], entries = [], exports = {}; let refIndex = 0, receive;
  const state = { connected, phase: "local", name: "synthetic account", provider: "google" };
  const store = { getSyncSnapshot: () => JSON.stringify(state), getServerSyncSnapshot() {}, subscribeSync() {}, startSync: () => () => {}, getPlanScope: () => "synthetic" };
  for (const method of ["loginSync", "disconnectSync", "resolveSyncConflict", "exportPlanBackup", "syncNow"]) store[method] = () => writes.push(method);
  const source = ts.transpileModule(readFileSync(new URL("../../app/todo/sync-panel.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(source, { exports, require(name) {
    if (name === "react") return { useRef: initial => refs[refIndex++] ??= { current: initial }, useState: initial => [initial, () => {}], useEffect: effect => effects.push(effect), useSyncExternalStore: (_subscribe, snapshot) => snapshot() };
    if (name === "react/jsx-runtime") return { jsx: element, jsxs: element };
    if (name === "./sync-store") return store;
    if (name === "./settings-events") return { subscribeSettingsDialog(fn) { receive = fn; return () => {}; } };
    if (name === "./dialog-focus") return dialogFocus;
    if (name === "./account-deletion-dialog") return { AccountDeletionDialog: () => null };
    if (name === "./apple-login-button") return { AppleLoginButton: () => null };
    if (name === "./account-settings") return { syncStatusLabel: state => state.phase };
    if (name === "./account-help-links") return { AccountHelpLinks: () => null };
    if (name === "./push-settings") return { PushSettings: () => null };
    if (name.startsWith("react-icons/")) return {};
    throw Error(name);
  } });
  const tree = exports.SyncPanel({ fallback: "synthetic", onAccountDialogChange: open => changes.push(open), onShowProfile: onShowProfile ?? (() => entries.push("account")) });
  class FakeDialog extends EventTarget { open = false; showModal() { this.open = true; } close() { this.open = false; this.dispatchEvent(new Event("close")); } }
  refs[0].current = new FakeDialog();
  const cleanups = effects.map(effect => effect()).filter(Boolean);
  return { tree, changes, writes, entries, dialogs: [refs[0].current], receive: target => receive(target), cleanup: () => cleanups.forEach(fn => fn()) };
}

test("legacy profile and sync actions enter settings account for guests and connected accounts without modal round trips", () => {
  for (const connected of [false, true]) {
    const h = panel(connected);
    for (const target of ["profile", "sync"]) h.receive(target);
    assert.deepEqual(h.entries, ["account", "account"]); assert(h.dialogs.every(dialog => !dialog.open));
    assert.deepEqual(h.writes, []); h.cleanup();
  }
});

test("account deletion retains its existing confirmation dialog and clears the active marker when closed", () => {
  const h = panel(true); h.receive("delete");
  assert.equal(h.dialogs[0].open, true); assert.equal(h.changes.at(-1), true);
  h.dialogs[0].close(); assert.equal(h.changes.at(-1), false);
  assert.deepEqual(h.writes, []); h.cleanup();
});

test("sidebar account name and sync status enter settings without opening dialogs or writing account data", () => {
  let entries = 0; const h = panel(true, () => entries++);
  nodes(h.tree).find(n => n.props?.["aria-label"] === "내 정보 보기").props.onClick();
  nodes(h.tree).find(n => n.props?.className === "oddk-syncTrigger").props.onClick();
  assert.equal(entries, 2); assert(h.dialogs.every(dialog => !dialog.open)); assert.deepEqual(h.writes, []); h.cleanup();
});
