import { syncClient } from "./supabase-client";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { NATIVE_AUTH_REDIRECT } from "./native-options";
import { DELETION_KEY, pendingDeletion, eraseAccountData } from "./account-data";
import { alignPushBinding, clearPushBinding, stopPushForLogout } from "./push-client";
import { validPlan } from "../../supabase/functions/_shared/plan";
import { loadPlan, upgradeStoredPlan, preserveMigrationBackup, preserveV6Backup } from "../../supabase/functions/_shared/plan-migration";
import type { Session as AuthSession } from "@supabase/supabase-js";
import { sameValue } from "../../supabase/functions/_shared/json-equality";
import type { Plan } from "../../supabase/functions/_shared/plan";
import type { ReplanOptions } from "../../supabase/functions/_shared/replan";
const ENDPOINT = "https://synxmskamifpovuziecx.supabase.co/functions/v1/plan-sync";
const LOCAL_KEY = "oddk.todo.v1";
const SESSION_KEY = "oddk.sync.session.v1";
const CHANGE_EVENT = "oddk-todo-change";
// Enable in a QA build after membership/provider setup; verify before release.
export const APPLE_LOGIN_ENABLED = false;
export const APPLE_LOGIN_PREPARING_MESSAGE = "Apple 로그인은 연결 준비 중이에요. 지금은 Google·GitHub로 로그인할 수 있어요.";
// Keep providers enabled; the user performs actual OAuth acceptance separately.

type Session = { id: string; deviceId: string; name: string; displayName: string; provider: string; createdAt: string; lastSignInAt: string };
type Cache = { plan: string; version: number; dirty: boolean };
type Cloud = { plan: unknown; version: number; updated_at: string };
export type SyncStatus = { connected: boolean; name: string; displayName?: string; provider?: string; createdAt?: string; lastSignInAt?: string; refreshRequired?: boolean; deletionPending?: boolean; phase: "local" | "syncing" | "synced" | "waiting" | "conflict" | "error"; message: string; updatedAt?: string };
const INITIAL: SyncStatus = { connected: false, name: "", phase: "local", message: "이 기기에 저장 중" };
let state = JSON.stringify(INITIAL);
const listeners = new Set<() => void>();
let busy = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let stop: (() => void) | undefined;
let conflict: Cloud | null = null;
let blockedDevice: string | null = null;
const cacheKey = (session: Session) => `oddk.sync.plan.${session.id}`;
function session(): Session | null {
  const raw = localStorage.getItem(SESSION_KEY); if (!raw) return null;
  const value = JSON.parse(raw);
  if (!value || typeof value.id !== "string" || typeof value.deviceId !== "string") throw new Error("로그인 저장 정보를 읽을 수 없어요. 원본을 백업한 뒤 다시 로그인해주세요.");
  return value;
}
function cacheEnvelope(s: Session): Cache {
  const value = JSON.parse(localStorage.getItem(cacheKey(s)) ?? "null");
  if (!value || typeof value.plan !== "string" || !Number.isSafeInteger(value.version) || value.version < 0 || typeof value.dirty !== "boolean") throw new Error("계정 저장 정보를 읽을 수 없어요. 원본을 백업해주세요.");
  return value;
}
function cache(s: Session): Cache {
  const value = cacheEnvelope(s);
  const loaded = loadPlan(value.plan); if (!loaded.ok) throw new Error(loaded.error);
  return value;
}
function backup(key: string, raw: string, reason: string) {
  localStorage.setItem(`${key}.${reason}.${Date.now()}.${crypto.randomUUID()}`, raw);
  localStorage.setItem(`${key}.backup`, raw);
}
function prepareCache(s: Session): Cache {
  const before = cache(s); const loaded = loadPlan(before.plan);
  if (!loaded.ok) throw new Error(loaded.error);
  if (!loaded.migrated) return before;
  const key = cacheKey(s);
  preserveMigrationBackup(localStorage, key, before.plan);
  const next = { ...before, plan: JSON.stringify(loaded.plan), dirty: true };
  localStorage.setItem(`${key}.last-valid`, next.plan);
  localStorage.setItem(key, JSON.stringify(next)); changed(); return next;
}
function readCloud(remote: Cloud, s: Session): { remote: Cloud; migrated: boolean } {
  const raw = JSON.stringify(remote?.plan); const loaded = loadPlan(raw ?? "null");
  if (!loaded.ok || !Number.isSafeInteger(remote.version) || remote.version < 0) {
    backup(cacheKey(s), JSON.stringify(remote), "invalid-remote");
    throw new SyncError("서버 데이터 형식을 확인해야 해요. 이 기기의 정상 저장본과 미전송 변경은 유지했어요. 새로고침 후 다시 확인해주세요.", 422);
  }
  if (loaded.migrated) preserveMigrationBackup(localStorage, cacheKey(s), raw);
  return { remote: { ...remote, plan: loaded.plan }, migrated: loaded.migrated };
}
function changed() { window.dispatchEvent(new Event(CHANGE_EVENT)); }
function publish(next: SyncStatus) { state = JSON.stringify({ ...next, deletionPending: !!pendingDeletion(localStorage) }); listeners.forEach((notify) => notify()); }
function status(s: Session, phase: SyncStatus["phase"], message: string, updatedAt?: string) { publish({ connected: true, name: s.name, displayName: s.displayName, provider: s.provider, createdAt: s.createdAt, lastSignInAt: s.lastSignInAt, phase, message, updatedAt }); }
function current(s: Session) { const now = session(); return now?.id === s.id && now.deviceId === s.deviceId && pendingDeletion(localStorage)?.userId !== s.id; }
class SyncError extends Error { readonly code: number; constructor(message: string, code: number) { super(message); this.code = code; } }
async function api(action: string, values: object = {}, s?: Pick<Session, "id">): Promise<Cloud & { id: string }> {
  const { data: auth, error } = await syncClient().auth.getSession();
  if (error || !auth.session || (s && auth.session.user.id !== s.id)) throw new SyncError("로그인이 필요해요. 저장한 내용은 이 기기에 남아 있어요.", 401);
  const response = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.session.access_token}` }, body: JSON.stringify({ action, ...values }), signal: AbortSignal.timeout(15000), cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new SyncError(data.error || "동기화하지 못했어요.", response.status);
  return data;
}
export const getSyncSnapshot = () => state;
export async function commitAccountReplan(scope: string, expected: Plan, proposed: Plan, options: ReplanOptions, executionRevision: number) {
  const s = session();
  if (!s || s.id !== scope || busy || conflict || blockedDevice === s.deviceId) throw new Error("동기화를 마친 뒤 다시 미리보기를 만들어주세요.");
  const before = cache(s);
  if (before.dirty || !sameValue(JSON.parse(before.plan), expected)) throw new Error("기기 계획이 바뀌었거나 전송 대기 중이에요. 동기화 후 다시 확인해주세요.");
  busy = true;
  try {
    const check = async () => {
      const auth = await syncClient().auth.getSession();
      if (auth.error || auth.data.session?.user.id !== scope || !current(s)) throw new Error("계정이 바뀌었어요. 원래 계정에서 저장 결과를 확인해주세요.");
    };
    await check();
    let remote: Cloud;
    try { remote = await api("replan", { plan: proposed, version: before.version, options, executionRevision }, s); }
    catch (error) {
      await check();
      try { remote = await api("pull", {}, s); }
      catch { throw new Error("저장 결과를 확인하지 못했어요. 연결 후 동기화하고 복구안을 확인해주세요."); }
      if (remote.version !== before.version + 1 || !sameValue(remote.plan, proposed)) throw error;
    }
    await check();
    remote = readCloud(remote, s).remote;
    if (remote.version !== before.version + 1 || !sameValue(remote.plan, proposed)) throw new Error("승인한 변경의 저장 결과를 확인해야 해요. 동기화 후 확인해주세요.");
    const latest = cache(s);
    if (latest.dirty || latest.version !== before.version || !sameValue(JSON.parse(latest.plan), expected)) {
      if (!latest.dirty && latest.version >= remote.version && sameValue(JSON.parse(latest.plan), proposed)) return true;
      conflict = remote; status(s, "conflict", "재조정은 서버에 저장됐지만 이 기기의 새 변경도 있어요. 보관할 내용을 비교해주세요.");
      return false;
    }
    try {
      const raw = JSON.stringify(remote.plan);
      localStorage.setItem(`${cacheKey(s)}.last-valid`, raw);
      localStorage.setItem(cacheKey(s), JSON.stringify({ plan: raw, version: remote.version, dirty: false }));
      changed(); status(s, "synced", "재조정한 계획을 모든 기기와 동기화했어요.", remote.updated_at);
      return true;
    } catch { throw new Error("서버에는 저장됐지만 기기 저장에 실패했어요. 저장 공간을 확보하고 동기화해주세요. 복구안은 보관돼 있어요."); }
  } finally { busy = false; }
}
export function getPlanScope() { try { return session()?.id ?? "local"; } catch { return "unreadable-session"; } }
export const getServerSyncSnapshot = () => JSON.stringify(INITIAL);
export function subscribeSync(notify: () => void) { listeners.add(notify); return () => { listeners.delete(notify); }; }
export function getPlanSnapshot(fallback: string) {
  try {
    const s = session(); if (!s) return localStorage.getItem(LOCAL_KEY) ?? fallback;
    const raw = localStorage.getItem(cacheKey(s)); if (raw === null) return "null";
    try { const value = JSON.parse(raw); return typeof value?.plan === "string" ? value.plan : raw; } catch { return raw; }
  } catch { return localStorage.getItem(SESSION_KEY) ?? "null"; }
}
export function subscribePlan(notify: () => void) {
  const onStorage = (event: StorageEvent) => { if (!event.key || event.key === LOCAL_KEY || event.key === SESSION_KEY || event.key.startsWith("oddk.sync.plan.")) notify(); };
  window.addEventListener("storage", onStorage); window.addEventListener(CHANGE_EVENT, notify);
  return () => { window.removeEventListener("storage", onStorage); window.removeEventListener(CHANGE_EVENT, notify); };
}
export function writePlan(plan: unknown) {
  if (!validPlan(plan)) throw new Error("할 일과 시간 설정을 확인해주세요.");
  const loaded = loadPlan(JSON.stringify(plan));
  if (!loaded.ok) throw new Error(loaded.error);
  const value = JSON.stringify(loaded.plan);
  const s = session();
  if (s && pendingDeletion(localStorage)?.userId === s.id) throw new Error("계정 삭제 결과를 먼저 확인해주세요.");
  if (s && blockedDevice === s.deviceId) throw new Error("새 데이터 형식에 맞게 페이지를 새로고침해주세요. 미전송 내용은 보관돼 있어요.");
  const key = s ? cacheKey(s) : LOCAL_KEY;
  const oldRaw = s ? cache(s).plan : localStorage.getItem(LOCAL_KEY);
  if (oldRaw !== null) {
    const old = loadPlan(oldRaw);
    if (!old.ok) throw new Error(old.error);
    if (old.migrated) preserveMigrationBackup(localStorage, key, oldRaw);
    preserveV6Backup(localStorage, key, oldRaw, loaded.plan);
  }
  // Keep the validated candidate durable before replacing the visible snapshot.
  localStorage.setItem(`${key}.last-valid`, value);
  if (s) { const before = cache(s); localStorage.setItem(cacheKey(s), JSON.stringify({ ...before, plan: value, dirty: true })); }
  else localStorage.setItem(LOCAL_KEY, value);
  changed();
  if (s && !conflict) { status(s, "waiting", "기기에 저장됨 · 동기화 대기"); clearTimeout(timer); timer = setTimeout(() => { void syncNow(); }, 400); }
}

export type PlanReplacementTarget = { scope: string; identity: string; snapshot: string };
/** Read-only preview gate. An import never resolves a sync conflict implicitly. */
export function readPlanReplacementTarget(fallback: string): PlanReplacementTarget {
  const s = session(), sync: SyncStatus = JSON.parse(state);
  if (hasPendingAccountDeletion()) throw Error("계정 삭제 결과를 먼저 확인해주세요. 현재 내용은 유지했어요.");
  if (busy || conflict || sync.phase === "conflict" || sync.phase === "error" || sync.refreshRequired || s && blockedDevice === s.deviceId) throw Error("동기화 상태를 확인한 뒤 파일을 다시 선택해주세요. 현재 내용은 유지했어요.");
  const cached = s ? cache(s) : null;
  if (s && (!sync.connected || sync.phase !== "synced" || cached?.dirty)) throw Error("현재 변경의 동기화가 끝난 뒤 파일을 다시 선택해주세요.");
  const snapshot = getPlanSnapshot(fallback), loaded = loadPlan(snapshot);
  if (!loaded.ok) throw Error(loaded.error);
  return { scope: s?.id ?? "local", identity: s ? JSON.stringify([s.id, s.deviceId, cached!.version]) : "local", snapshot };
}
export function replacePlanFromBackup(plan: Plan, expected: PlanReplacementTarget, fallback: string) {
  const current = readPlanReplacementTarget(fallback);
  if (!sameValue(current, expected)) throw Error("계정이나 현재 내용이 바뀌었어요. 파일을 다시 선택해주세요. 현재 내용은 유지했어요.");
  writePlan(plan);
  const saved = loadPlan(getPlanSnapshot(fallback));
  if (getPlanScope() !== expected.scope || !saved.ok || !sameValue(saved.plan, plan)) throw Error("백업 적용 결과를 확인하지 못했어요. 현재 내용을 다시 확인해주세요.");
}
export function restoreLastValidPlan() {
  const s = session();
  const key = s ? cacheKey(s) : LOCAL_KEY;
  const backup = localStorage.getItem(`${key}.last-valid`) ?? localStorage.getItem(`${key}.before-v6`) ?? localStorage.getItem(`${key}.before-v5`) ?? localStorage.getItem(`${key}.before-v4`) ?? localStorage.getItem(`${key}.before-v3`) ?? localStorage.getItem(`${key}.before-v2`);
  const result = backup ? loadPlan(backup) : null;
  if (!result?.ok) throw new Error("이 기기에 정상 저장본이 없어요. 원본 백업 파일을 보관해주세요.");
  const raw = s ? cacheEnvelope(s).plan : localStorage.getItem(LOCAL_KEY);
  if (raw !== null) localStorage.setItem(`${key}.recovery-original.${Date.now()}`, raw);
  if (s) localStorage.setItem(key, JSON.stringify({ ...cacheEnvelope(s), plan: JSON.stringify(result.plan), dirty: true }));
  else localStorage.setItem(key, JSON.stringify(result.plan));
  changed();
}
export function backupReviewPlan(plan: unknown) {
  const result = loadPlan(JSON.stringify(plan));
  if (!result.ok) throw new Error(result.error);
  const s = session();
  const key = s ? cacheKey(s) : LOCAL_KEY;
  const raw = JSON.stringify(result.plan);
  backup(key, raw, "review-backup");
}
export async function syncNow() {
  if (busy || conflict) return;
  let s: Session | null = null;
  let again = false;
  try {
    s = session(); if (!s || blockedDevice === s.deviceId || pendingDeletion(localStorage)?.userId === s.id) return;
    busy = true;
    const before = prepareCache(s);
    status(s, "syncing", "동기화 중");
    if (before.dirty) {
      let remote: Cloud;
      try { remote = await api("push", { plan: JSON.parse(before.plan), version: before.version }, s); }
      catch (error) {
        if (!(error instanceof SyncError) || error.code !== 409) throw error;
        remote = await api("pull", {}, s);
        if (!current(s)) return;
        remote = readCloud(remote, s).remote;
        if (JSON.stringify(remote.plan) !== cache(s).plan) { conflict = remote; status(s, "conflict", "다른 기기의 변경 내용과 겹쳤어요. 저장할 내용을 선택해주세요."); return; }
      }
      if (!current(s)) return;
      remote = readCloud(remote, s).remote;
      const latest = cache(s);
      const dirty = latest.plan !== before.plan;
      localStorage.setItem(cacheKey(s), JSON.stringify({ plan: dirty ? latest.plan : JSON.stringify(remote.plan), version: remote.version, dirty }));
      localStorage.setItem(`${cacheKey(s)}.last-valid`, dirty ? latest.plan : JSON.stringify(remote.plan));
      again = dirty;
      status(s, dirty ? "waiting" : "synced", dirty ? "변경 내용을 추가로 저장 중" : "모든 기기와 동기화됨", remote.updated_at);
    } else {
      const remote = await api("pull", {}, s);
      if (!current(s)) return;
      const checked = readCloud(remote, s);
      const latest = cache(s);
      if (latest.dirty) again = true;
      else {
        const raw = JSON.stringify(checked.remote.plan);
        localStorage.setItem(`${cacheKey(s)}.last-valid`, raw);
        localStorage.setItem(cacheKey(s), JSON.stringify({ plan: raw, version: remote.version, dirty: checked.migrated }));
        again = checked.migrated;
        status(s, again ? "waiting" : "synced", again ? "이전 데이터를 새 형식으로 저장 중" : "모든 기기와 동기화됨", remote.updated_at);
      }
    }
    changed();
  } catch (error) {
    if (s && current(s)) {
      if (error instanceof SyncError && error.code === 426) {
        blockedDevice = s.deviceId;
        status(s, "error", "새 데이터 형식에 맞게 페이지를 새로고침해주세요. 미전송 내용은 보관돼 있어요.");
        publish({ ...JSON.parse(state), refreshRequired: true });
      } else status(s, error instanceof SyncError && [401, 422].includes(error.code) ? "error" : "waiting", error instanceof Error && !(error instanceof TypeError) ? error.message : "연결 대기 중 · 내용은 이 기기에 저장돼 있어요.");
    }
  } finally {
    busy = false;
    if (again) { clearTimeout(timer); timer = setTimeout(() => { void syncNow(); }, 250); }
  }
}
export function startSync(fallback: string) {
  if (stop) return () => {};
  try {
    const upgraded = upgradeStoredPlan(localStorage, LOCAL_KEY);
    if (upgraded?.ok && upgraded.migrated) changed();
  } catch {
    publish({ ...INITIAL, phase: "error", message: "형식을 이전하지 못했어요. 원본은 보존돼 있어요. 저장 공간을 확인해주세요." });
    return () => {};
  }
  const check = () => { if (document.visibilityState === "visible") void syncNow(); };
  const privacyError = () => { if (active) publish({ ...INITIAL, phase: "error", message: "이전 계정의 알림 연결을 차단하지 못했어요. 브라우저 알림 설정을 확인해주세요." }); };
  const storage = (event: StorageEvent) => {
    if (event.key === DELETION_KEY) {
      if (pendingDeletion(localStorage)) publish({ ...JSON.parse(state), phase: "error", message: "다른 창에서 요청한 계정 삭제 결과를 확인해주세요." });
      else check();
      changed();
    }
    if (event.key === SESSION_KEY) { conflict = null; void alignPushBinding(session()?.id ?? null).catch(privacyError); if (!session()) publish(INITIAL); check(); changed(); }
  };
  const interval = setInterval(check, 5000);
  let active = true;
  const hydrate = (auth: AuthSession | null) => { if (active) void alignPushBinding(auth?.user.id ?? null).then(() => { if (active && auth) return connectAccount(auth, fallback); }).catch((error) => { if (active) publish({ ...INITIAL, phase: "error", message: error instanceof Error ? error.message : "계정 데이터를 불러오지 못했어요." }); }); };
  const { data: authListener } = syncClient().auth.onAuthStateChange((event, auth) => {
    if (event === "SIGNED_OUT") { void clearPushBinding().catch(privacyError); localStorage.removeItem(SESSION_KEY); conflict = null; publish(INITIAL); changed(); }
    else if (auth && session()?.id !== auth.user.id) { localStorage.removeItem(SESSION_KEY); changed(); void clearPushBinding().then(() => { if (active) setTimeout(() => hydrate(auth), 0); }).catch(privacyError); }
    else if (auth && event === "SIGNED_IN") setTimeout(() => hydrate(auth), 0);
  });
  void syncClient().auth.getSession().then(async ({ data, error }) => {
    if (pendingDeletion(localStorage)) {
      try { await recoverAccountDeletion(); } catch (failure) { publish({ ...INITIAL, phase: "error", message: failure instanceof Error ? failure.message : "계정 삭제 결과를 확인해주세요." }); }
      return;
    }
    if (error) publish({ ...INITIAL, phase: "error", message: "로그인 상태를 확인하지 못했어요. 다시 로그인해주세요." }); else hydrate(data.session);
  });
  window.addEventListener("online", check); window.addEventListener("focus", check); window.addEventListener("storage", storage); document.addEventListener("visibilitychange", check);
  check();
  stop = () => { active = false; authListener.subscription.unsubscribe(); clearInterval(interval); clearTimeout(timer); window.removeEventListener("online", check); window.removeEventListener("focus", check); window.removeEventListener("storage", storage); document.removeEventListener("visibilitychange", check); stop = undefined; };
  return stop;
}
let connecting: string | null = null;
async function connectAccount(auth: AuthSession, fallback: string) {
  if (connecting === auth.user.id) return;
  const metadata = auth.user.user_metadata;
  const hint = localStorage.getItem("oddk.sync.login-provider");
  const provider = hint && auth.user.identities?.some((identity) => identity.provider === hint) ? hint : auth.user.app_metadata.provider ?? "github";
  const profile = { name: auth.user.email ?? "로그인한 계정", displayName: String(metadata.full_name || metadata.name || metadata.user_name || auth.user.email?.split("@")[0] || "사용자").slice(0, 80), provider, createdAt: auth.user.created_at, lastSignInAt: auth.user.last_sign_in_at ?? "" };
  const oldSession = session();
  const deleting = pendingDeletion(localStorage);
  if (APPLE_LOGIN_ENABLED && (!deleting || deleting.userId === auth.user.id) && provider === "apple" && auth.provider_refresh_token) await lifecycleRequest("apple-token", { refreshToken: auth.provider_refresh_token }, auth.access_token);
  if (deleting) { if (oldSession) status(oldSession, "error", "계정 삭제 결과를 먼저 확인해주세요."); return; }
  if (oldSession?.id === auth.user.id) { localStorage.setItem(SESSION_KEY, JSON.stringify({ ...oldSession, ...profile })); await syncNow(); return; }
  connecting = auth.user.id;
  try {
  const local = localStorage.getItem(LOCAL_KEY) ?? fallback;
  const loaded = loadPlan(local); if (!loaded.ok) throw new Error(loaded.error);
  const remote = await api("ensure", { plan: loaded.plan }, { id: auth.user.id });
  const latest = await syncClient().auth.getSession();
  if (latest.data.session?.user.id !== auth.user.id || pendingDeletion(localStorage)?.userId === auth.user.id) return;
  const s: Session = { id: auth.user.id, deviceId: crypto.randomUUID(), ...profile };
  const checked = readCloud(remote, s);
  const latestLocal = localStorage.getItem(LOCAL_KEY) ?? local;
  backup(LOCAL_KEY, latestLocal, "before-login");
  backup(cacheKey(s), latestLocal, "before-login");
  // 오프라인 미전송 내용이 있으면 덮어쓰지 않고 기존 버전으로 재전송/충돌 확인한다.
  const previous = localStorage.getItem(cacheKey(s));
  if (previous) cache(s); // Never overwrite an unreadable account cache with a fresh plan.
  if (!previous || !cache(s).dirty) {
    const raw = JSON.stringify(checked.remote.plan);
    localStorage.setItem(`${cacheKey(s)}.last-valid`, raw);
    localStorage.setItem(cacheKey(s), JSON.stringify({ plan: raw, version: remote.version, dirty: checked.migrated }));
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  conflict = null; changed(); status(s, "synced", "모든 기기와 동기화됨", remote.updated_at);
  await syncNow();
  } finally { if (connecting === auth.user.id) connecting = null; }
}
export async function loginSync(provider: "google" | "github" | "apple") {
  if (provider === "apple") {
    if (!APPLE_LOGIN_ENABLED) throw new Error(APPLE_LOGIN_PREPARING_MESSAGE);
    const ready = await lifecycleRequest("capabilities");
    if (!ready.appleReady) throw new Error("Apple 로그인 설정을 준비 중이에요. 현재는 Google·GitHub로 로그인할 수 있어요.");
  }
  localStorage.setItem("oddk.sync.login-provider", provider);
  const native = Capacitor.isNativePlatform();
  const { data, error } = await syncClient().auth.signInWithOAuth({ provider, options: { redirectTo: native ? NATIVE_AUTH_REDIRECT : `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/todo/`, skipBrowserRedirect: native } });
  if (error) throw error;
  if (native) {
    if (!data.url) throw Error("로그인 주소를 만들지 못했어요. 다시 시도해주세요.");
    await Browser.open({ url: data.url });
  }
}
export async function disconnectSync() {
  const s = session();
  if (pendingDeletion(localStorage)) throw new Error("계정 삭제 결과를 먼저 확인해주세요.");
  if (s && cache(s).dirty) throw new Error("아직 전송하지 못한 내용이 있어요. 동기화하거나 백업한 뒤 다시 시도해주세요.");
  if (s) backup(cacheKey(s), cache(s).plan, "before-logout");
  if (s) await stopPushForLogout(s.id);
  if (s && !current(s)) throw new Error("로그인한 계정이 바뀌었어요. 현재 계정에서 다시 시도해주세요.");
  const { error } = await syncClient().auth.signOut({ scope: "local" });
  if (error) throw error;
  localStorage.removeItem(SESSION_KEY); conflict = null; publish(INITIAL); changed();
}
const LIFECYCLE_ENDPOINT = "https://synxmskamifpovuziecx.supabase.co/functions/v1/account-lifecycle";
class AccountError extends Error { constructor(message: string, readonly code: string) { super(message); } }
async function lifecycleRequest(action: string, values: object = {}, token?: string) {
  const response = await fetch(LIFECYCLE_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ action, ...values }), signal: AbortSignal.timeout(30000), cache: "no-store", redirect: "error" });
  const data = await response.json();
  if (!response.ok) throw new AccountError(data.error || "계정 처리를 완료하지 못했어요.", data.code ?? "server_error");
  return data;
}
export function hasPendingAccountDeletion() { return !!pendingDeletion(localStorage); }
async function finishAccountDeletion(userId: string) {
  const { data } = await syncClient().auth.getSession();
  // Never sign a different account out after a cross-tab account change.
  if (data.session?.user.id === userId) {
    const { error } = await syncClient().auth.signOut({ scope: "local" });
    if (error && error.status !== 403 && error.status !== 401) throw error;
  }
  if (!data.session || data.session.user.id === userId) await clearPushBinding();
  eraseAccountData(localStorage, userId);
  localStorage.removeItem(DELETION_KEY); // Last: incomplete local cleanup remains retryable.
  conflict = null; publish({ ...INITIAL, message: "계정과 계정 데이터를 삭제했어요." }); changed();
  window.dispatchEvent(new Event("oddk-draft-change"));
}
export async function recoverAccountDeletion() {
  const pending = pendingDeletion(localStorage);
  if (!pending) return false;
  const result = await lifecycleRequest("status", { operation: pending.operation });
  if (result.state === "deleted") { await finishAccountDeletion(pending.userId); return true; }
  throw new Error("아직 삭제 완료를 확인하지 못했어요. 계정 삭제 창에서 다시 시도해주세요.");
}
export async function deleteSyncAccount() {
  if (busy || connecting) throw new Error("동기화를 마친 뒤 다시 시도해주세요.");
  let pending = pendingDeletion(localStorage);
  const { data, error } = await syncClient().auth.getSession();
  if (pending) {
    const result = await lifecycleRequest("status", { operation: pending.operation });
    if (result.state === "deleted") { await finishAccountDeletion(pending.userId); return; }
  }
  if (error || !data.session || (pending && pending.userId !== data.session.user.id)) throw new Error("삭제한 계정으로 다시 로그인해 결과를 확인해주세요. 문의: seonyoungyoo16@gmail.com");
  const auth = data.session;
  const s = session();
  if (!pending) {
    if (!s || s.id !== auth.user.id) throw new Error("현재 계정을 다시 확인해주세요.");
    const operation = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, "0")).join("");
    pending = { userId: auth.user.id, operation };
    localStorage.setItem(DELETION_KEY, JSON.stringify(pending));
  }
  clearTimeout(timer);
  if (s) status(s, "error", "계정을 삭제하고 있어요. 완료까지 기다려주세요.");
  try {
    const result = await lifecycleRequest("delete", { operation: pending.operation, confirmation: "DELETE_ACCOUNT" }, auth.access_token);
    if (result.state !== "deleted") throw new Error("삭제 완료를 확인하지 못했어요. 다시 확인해주세요.");
    await finishAccountDeletion(pending.userId);
  } catch (error) {
    // These errors occur before the server starts deleting the account.
    if (error instanceof AccountError && ["apple_reauthentication_required", "apple_not_configured", "invalid_request"].includes(error.code)) {
      localStorage.removeItem(DELETION_KEY);
      if (s) status(s, "error", error.message);
    }
    throw error;
  }
}
export async function resolveSyncConflict(use: "local" | "cloud") {
  const s = session(); if (!s || !conflict) return;
  const before = cache(s).plan;
  let remote: Cloud = await api("pull", {}, s);
  if (!current(s)) return;
  remote = readCloud(remote, s).remote;
  if (remote.version !== conflict.version) { conflict = remote; status(s, "conflict", "다른 기기에서 다시 변경했어요. 최신 내용을 확인하고 선택해주세요."); throw new Error("최신 변경 내용으로 비교 화면을 갱신했어요. 다시 확인해주세요."); }
  if (cache(s).plan !== before) throw new Error("이 기기 내용도 바뀌었어요. 최신 내용을 다시 비교하고 선택해주세요.");
  backup(cacheKey(s), use === "cloud" ? before : JSON.stringify(remote.plan), "unchosen-conflict");
  localStorage.setItem(`${cacheKey(s)}.last-valid`, use === "cloud" ? JSON.stringify(remote.plan) : before);
  localStorage.setItem(cacheKey(s), JSON.stringify({ plan: use === "cloud" ? JSON.stringify(remote.plan) : cache(s).plan, version: remote.version, dirty: use === "local" }));
  conflict = null; changed(); await syncNow();
}
export function conflictPreview() {
  const s = session();
  return s && conflict ? { local: JSON.stringify(JSON.parse(cache(s).plan), null, 2), cloud: JSON.stringify(conflict.plan, null, 2) } : null;
}
export function exportPlanBackup(fallback: string, previous = false) {
  const s = session();
  const value = previous ? localStorage.getItem(`${s ? cacheKey(s) : LOCAL_KEY}.backup`) : getPlanSnapshot(fallback);
  if (!value) throw new Error("백업한 데이터가 없어요.");
  const url = URL.createObjectURL(new Blob([value], { type: "application/json" }));
  const a = document.createElement("a"); a.href = url; a.download = previous ? "oddk-before-sync.json" : "oddk-plan-backup.json"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
