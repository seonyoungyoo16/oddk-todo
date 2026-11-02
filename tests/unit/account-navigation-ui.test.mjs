import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const element = (type, props) => ({ type, props });
function nodes(n) { return !n || typeof n !== "object" ? [] : [n, ...[n.props?.children].flat(Infinity).flatMap(nodes)]; }
function text(n) { return typeof n === "string" ? n : n && typeof n === "object" ? [n.props?.children].flat(Infinity).map(text).join("") : ""; }
function panel(connected) {
  const refs = [], effects = [], changes = [], writes = [], exports = {}; let refIndex = 0, receive;
  const state = { connected, phase: "local", name: "synthetic account", provider: "google" };
  const store = { getSyncSnapshot: () => JSON.stringify(state), getServerSyncSnapshot() {}, subscribeSync() {}, startSync: () => () => {}, getPlanScope: () => "synthetic" };
  for (const method of ["loginSync", "disconnectSync", "resolveSyncConflict", "exportPlanBackup", "syncNow"]) store[method] = () => writes.push(method);
  const source = ts.transpileModule(readFileSync(new URL("../../app/todo/sync-panel.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(source, { exports, require(name) {
    if (name === "react") return { useRef: initial => refs[refIndex++] ??= { current: initial }, useState: initial => [initial, () => {}], useEffect: effect => effects.push(effect), useSyncExternalStore: (_subscribe, snapshot) => snapshot() };
    if (name === "react/jsx-runtime") return { jsx: element, jsxs: element };
    if (name === "./sync-store") return store;
    if (name === "./settings-events") return { subscribeSettingsDialog(fn) { receive = fn; return () => {}; } };
    if (name === "./dialog-focus") return { keepFocusInDialog() {} };
    if (name === "./account-deletion-dialog") return { AccountDeletionDialog: () => null };
    if (name === "./apple-login-button") return { AppleLoginButton: () => null };
    if (name === "./account-help-links") return { AccountHelpLinks: () => null };
    if (name === "./push-settings") return { PushSettings: () => null };
    if (name.startsWith("react-icons/")) return {};
    throw Error(name);
  } });
  const tree = exports.SyncPanel({ fallback: "synthetic", onAccountDialogChange: open => changes.push(open) });
  class FakeDialog extends EventTarget { open = false; showModal() { this.open = true; } close() { this.open = false; this.dispatchEvent(new Event("close")); } }
  for (const ref of refs) ref.current = new FakeDialog();
  const cleanups = effects.map(effect => effect()).filter(Boolean);
  return { tree, changes, writes, dialogs: refs.map(ref => ref.current), receive: target => receive(target), cleanup: () => cleanups.forEach(fn => fn()) };
}

test("the fifth destination reuses the login/sync dialog for a guest and clears its active marker when closed", () => {
  const h = panel(false); h.receive("profile");
  assert.equal(h.dialogs[0].open, true); assert.equal(h.dialogs[1].open, false); assert.equal(h.changes.at(-1), true);
  h.dialogs[0].close(); assert.equal(h.changes.at(-1), false); assert.deepEqual(h.writes, []); h.cleanup();
});

test("a connected account opens its existing profile, can enter sync management, and returns without touching auth/storage", () => {
  const h = panel(true); h.receive("profile");
  assert.equal(h.dialogs[1].open, true); assert.equal(h.changes.at(-1), true);
  nodes(h.tree).find(n => n.type === "button" && text(n) === "기기 동기화 관리").props.onClick();
  assert.equal(h.dialogs[1].open, false); assert.equal(h.dialogs[0].open, true); assert.equal(h.changes.at(-1), true);
  h.dialogs[0].close(); assert.equal(h.changes.at(-1), false); assert.deepEqual(h.writes, []); h.cleanup();
});

test("existing direct sync/delete entry points share the active marker rather than introducing another view", () => {
  const h = panel(true);
  for (const [target, index] of [["sync", 0], ["delete", 2]]) {
    h.receive(target); assert(h.dialogs[index].open); assert.equal(h.changes.at(-1), true);
    h.dialogs[index].close(); assert.equal(h.changes.at(-1), false);
  }
  assert.deepEqual(h.writes, []); h.cleanup();
});
