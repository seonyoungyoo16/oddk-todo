import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const element = (type, props) => ({ type, props });
const nodes = n => !n || typeof n !== "object" ? [] : [n, ...[n.props?.children].flat(Infinity).flatMap(nodes)];
const text = n => typeof n === "string" ? n : n && typeof n === "object" ? [n.props?.children].flat(Infinity).map(text).join("") : "";
const state = { connected: true, phase: "synced", name: "real-source@example.test", displayName: "실제 상태 이름", provider: "github", createdAt: "2026-10-01T01:00:00Z", lastSignInAt: "2026-11-04T01:00:00Z", message: "실제 저장 상태 메시지" };

function account(initial = state, overrides = {}) {
  const values = [], refs = [], effects = [], calls = [], updates = []; let index = 0, refIndex = 0;
  const api = { useEffect: effect => effects.push(effect), useRef: initial => refs[refIndex++] ??= { current: initial }, useState(initial) { const i = index++; if (!(i in values)) values[i] = initial; return [values[i], value => { updates.push(i); values[i] = value; }]; } };
  const store = { conflictPreview: () => ({ local: "actual local snapshot", cloud: "actual cloud snapshot" }), getPlanScope: () => "current-account-scope" };
  for (const key of ["loginSync", "disconnectSync", "resolveSyncConflict", "exportPlanBackup", "syncNow"]) store[key] = (...args) => { calls.push([key, ...args]); return overrides[key]?.(...args); };
  const exports = {}, code = ts.transpileModule(readFileSync(new URL("../../app/todo/account-settings.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  function PushSettings() {} function DeviceReminderSettings() {} function SettingsCard() {} function AIConsentSettings() {}
  vm.runInNewContext(code, { exports, Date, Error, require(name) {
    if (name === "react") return api;
    if (name === "react/jsx-runtime") return { jsx: element, jsxs: element };
    if (name.startsWith("react-icons/")) return {};
    if (name === "./sync-store") return store;
    if (name === "./settings-card") return { SettingsCard };
    if (name === "./apple-login-button") return { AppleLoginButton: function AppleLoginButton() {} };
    if (name === "./account-help-links") return { AccountHelpLinks: () => null };
    if (name === "./ai-consent-controls") return { AIConsentSettings };
    if (name === "./native-reminder-settings") return { DeviceReminderSettings };
    if (name === "./push-settings") return { PushSettings };
    if (name === "./settings-events") return { openSettingsDialog: value => calls.push(["dialog", value]) };
    throw Error(name);
  } });
  const render = () => { index = 0; refIndex = 0; return exports.AccountSettings({ state: initial, fallback: "original-plan-json", onShowNotifications: () => calls.push(["data-tab"]) }); };
  return { render, calls, updates, values, exports, PushSettings, DeviceReminderSettings, SettingsCard, AIConsentSettings, cleanup() { for (const effect of effects.splice(0)) effect()?.(); } };
}
const button = (tree, label) => nodes(tree).find(n => n.type === "button" && text(n) === label);
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

test("account tab immediately renders the three approved groups from current metadata without profile or sync entry buttons", () => {
  const h = account(), tree = h.render(), all = nodes(tree);
  assert.deepEqual(all.filter(n => n.type === h.SettingsCard).map(n => n.props.title), ["계정 정보", "이 기기·저장 상태", "개인정보·AI 사용"]);
  for (const value of [state.displayName, state.name, "GitHub", h.exports.syncStatusLabel(state)]) assert(text(tree).includes(value));
  assert(!text(tree).includes(state.message), "duplicate storage prose is intentionally absent");
  assert(!button(tree, "내 정보")); assert(!button(tree, "동기화 관리")); assert(!all.some(n => n.type === "dialog" || n.type === h.PushSettings));
  assert(all.some(n => n.type === h.AIConsentSettings)); assert.deepEqual(h.calls, []);
  button(tree, "알림·백업").props.onClick(); assert.deepEqual(h.calls, [["data-tab"]]);
});

test("signed-out account uses existing provider callbacks while absent metadata is displayed as unknown", async () => {
  const guest = account({ connected: false, phase: "local", name: "", message: "이 기기에 저장 중" });
  let tree = guest.render(); assert(text(tree).includes("로그인하지 않았어요")); assert(!button(tree, "로그아웃"));
  button(tree, "Google 로그인").props.onClick(); await flush(); button(guest.render(), "GitHub 로그인").props.onClick(); await flush();
  assert.deepEqual(guest.calls, [["loginSync", "google"], ["loginSync", "github"]]);
  const unknown = account({ ...state, createdAt: "invalid", lastSignInAt: "", provider: undefined });
  assert.equal(nodes(unknown.render()).filter(n => n.type === "dd" && text(n) === "—").length, 3);
});

test("sync requests cannot double-submit and sign out uses the existing store operation", async () => {
  let finish; const pending = new Promise(resolve => { finish = resolve; }), h = account(state, { syncNow: () => pending });
  const sync = button(h.render(), "지금 동기화"); sync.props.onClick(); sync.props.onClick();
  assert.deepEqual(h.calls, [["syncNow"]]); assert.equal(button(h.render(), "지금 동기화").props.disabled, true);
  finish(); await flush(); button(h.render(), "로그아웃").props.onClick(); await flush();
  assert.deepEqual(h.calls, [["syncNow"], ["disconnectSync"]]);
});

test("conflict comparison and each resolution/backup preserve the actual snapshots and existing arguments", async () => {
  for (const [label, expected] of [["이 기기 내용을 저장", ["resolveSyncConflict", "local"]], ["다른 기기 내용을 사용", ["resolveSyncConflict", "cloud"]], ["현재 내용 백업", ["exportPlanBackup", "original-plan-json"]]]) {
    const h = account({ ...state, phase: "conflict" }), tree = h.render();
    assert(text(tree).includes("actual local snapshot")); assert(text(tree).includes("actual cloud snapshot")); assert(!button(tree, "지금 동기화"));
    button(tree, label).props.onClick(); await flush(); assert.deepEqual(h.calls, [expected]);
  }
});

test("failure/waiting/conflict labels do not claim sync success and failed actions show their real error", async () => {
  const h = account({ ...state, phase: "error" }, { syncNow: () => Promise.reject(Error("실제 연결 실패")) });
  assert.equal(h.exports.syncStatusLabel({ ...state, phase: "error" }), "연결 확인 필요");
  assert.equal(h.exports.syncStatusLabel({ ...state, phase: "waiting" }), "저장 대기");
  assert.equal(h.exports.syncStatusLabel({ ...state, phase: "conflict" }), "충돌 확인 필요");
  button(h.render(), "지금 동기화").props.onClick(); await flush(); assert(text(h.render()).includes("실제 연결 실패"));
});

test("deletion stays behind its existing confirmation action and pending recovery stays reachable", () => {
  for (const pending of [false, true]) {
    const h = account({ ...state, deletionPending: pending }), tree = h.render();
    button(tree, pending ? "계정 삭제 결과 확인" : "계정 삭제").props.onClick(); assert.deepEqual(h.calls, [["dialog", "delete"]]);
  }
});

test("notifications remain platform guarded for guests and web push receives only the current connected account scope", () => {
  const h = account(), guest = h.exports.AccountNotifications({ state: { connected: false } });
  assert.equal(guest.type, h.DeviceReminderSettings); assert(!nodes(guest).some(n => n.type === h.PushSettings));
  button(guest, "로그인하고 설정").props.onClick(); assert.deepEqual(h.calls, [["dialog", "sync"]]);
  const connected = h.exports.AccountNotifications({ state }); assert.equal(connected.type, h.PushSettings); assert.equal(connected.props.userId, "current-account-scope");
});

test("unmounted account actions ignore late failures rather than updating a later account UI", async () => {
  let fail; const h = account(state, { syncNow: () => new Promise((_resolve, reject) => { fail = reject; }) });
  button(h.render(), "지금 동기화").props.onClick(); h.cleanup(); const before = h.updates.length;
  fail(Error("late old-account failure")); await flush(); assert.equal(h.updates.length, before);
});
