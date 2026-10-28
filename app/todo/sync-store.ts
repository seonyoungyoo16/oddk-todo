import { syncClient } from "./supabase-client";
import { validPlan } from "../../supabase/functions/_shared/plan";
import { loadPlan, upgradeStoredPlan, preserveMigrationBackup } from "../../supabase/functions/_shared/plan-migration";
import type { Session as AuthSession } from "@supabase/supabase-js";
const ENDPOINT = "https://synxmskamifpovuziecx.supabase.co/functions/v1/plan-sync";
const LOCAL_KEY = "oddk.todo.v1";
const SESSION_KEY = "oddk.sync.session.v1";
const CHANGE_EVENT = "oddk-todo-change";
// Keep providers enabled; the user performs actual OAuth acceptance separately.

type Session = { id: string; deviceId: string; name: string; displayName: string; provider: string; createdAt: string; lastSignInAt: string };
type Cache = { plan: string; version: number; dirty: boolean };
type Cloud = { plan: unknown; version: number; updated_at: string };
export type SyncStatus = { connected: boolean; name: string; displayName?: string; provider?: string; createdAt?: string; lastSignInAt?: string; refreshRequired?: boolean; phase: "local" | "syncing" | "synced" | "waiting" | "conflict" | "error"; message: string; updatedAt?: string };
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
function publish(next: SyncStatus) { state = JSON.stringify(next); listeners.forEach((notify) => notify()); }
function status(s: Session, phase: SyncStatus["phase"], message: string, updatedAt?: string) { publish({ connected: true, name: s.name, displayName: s.displayName, provider: s.provider, createdAt: s.createdAt, lastSignInAt: s.lastSignInAt, phase, message, updatedAt }); }
function current(s: Session) { const now = session(); return now?.id === s.id && now.deviceId === s.deviceId; }
class SyncError extends Error { readonly code: number; constructor(message: string, code: number) { super(message); this.code = code; } }
async function api(action: string, values: object = {}, s?: Session): Promise<Cloud & { id: string }> {
  const { data: auth, error } = await syncClient().auth.getSession();
  if (error || !auth.session || (s && auth.session.user.id !== s.id)) throw new SyncError("로그인이 필요해요. 저장한 내용은 이 기기에 남아 있어요.", 401);
  const response = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.session.access_token}` }, body: JSON.stringify({ action, ...values }), signal: AbortSignal.timeout(15000), cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new SyncError(data.error || "동기화하지 못했어요.", response.status);
  return data;
}
export const getSyncSnapshot = () => state;
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
  if (s && blockedDevice === s.deviceId) throw new Error("새 데이터 형식에 맞게 페이지를 새로고침해주세요. 미전송 내용은 보관돼 있어요.");
  const key = s ? cacheKey(s) : LOCAL_KEY;
  const oldRaw = s ? cache(s).plan : localStorage.getItem(LOCAL_KEY);
  if (oldRaw !== null) {
    const old = loadPlan(oldRaw);
    if (!old.ok) throw new Error(old.error);
    if (old.migrated) preserveMigrationBackup(localStorage, key, oldRaw);
  }
  // Keep the validated candidate durable before replacing the visible snapshot.
  localStorage.setItem(`${key}.last-valid`, value);
  if (s) { const before = cache(s); localStorage.setItem(cacheKey(s), JSON.stringify({ ...before, plan: value, dirty: true })); }
  else localStorage.setItem(LOCAL_KEY, value);
  changed();
  if (s && !conflict) { status(s, "waiting", "기기에 저장됨 · 동기화 대기"); clearTimeout(timer); timer = setTimeout(() => { void syncNow(); }, 400); }
}
export function restoreLastValidPlan() {
  const s = session();
  const key = s ? cacheKey(s) : LOCAL_KEY;
  const backup = localStorage.getItem(`${key}.last-valid`) ?? localStorage.getItem(`${key}.before-v4`) ?? localStorage.getItem(`${key}.before-v3`) ?? localStorage.getItem(`${key}.before-v2`);
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
    s = session(); if (!s || blockedDevice === s.deviceId) return;
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
  const storage = (event: StorageEvent) => { if (event.key === SESSION_KEY) { conflict = null; if (!session()) publish(INITIAL); check(); changed(); } };
  const interval = setInterval(check, 5000);
  let active = true;
  const hydrate = (auth: AuthSession | null) => { if (active && auth) void connectAccount(auth, fallback).catch((error) => { if (active) publish({ ...INITIAL, phase: "error", message: error instanceof Error ? error.message : "계정 데이터를 불러오지 못했어요." }); }); };
  const { data: authListener } = syncClient().auth.onAuthStateChange((event, auth) => {
    if (event === "SIGNED_OUT") { localStorage.removeItem(SESSION_KEY); conflict = null; publish(INITIAL); changed(); }
    else if (auth && session()?.id !== auth.user.id) { localStorage.removeItem(SESSION_KEY); changed(); setTimeout(() => hydrate(auth), 0); }
    else if (auth && event === "SIGNED_IN") setTimeout(() => hydrate(auth), 0);
  });
  void syncClient().auth.getSession().then(({ data, error }) => { if (error) publish({ ...INITIAL, phase: "error", message: "로그인 상태를 확인하지 못했어요. 다시 로그인해주세요." }); else hydrate(data.session); });
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
  if (oldSession?.id === auth.user.id) { localStorage.setItem(SESSION_KEY, JSON.stringify({ ...oldSession, ...profile })); await syncNow(); return; }
  connecting = auth.user.id;
  try {
  const local = localStorage.getItem(LOCAL_KEY) ?? fallback;
  const loaded = loadPlan(local); if (!loaded.ok) throw new Error(loaded.error);
  const remote = await api("ensure", { plan: loaded.plan });
  const latest = await syncClient().auth.getSession();
  if (latest.data.session?.user.id !== auth.user.id) return;
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
export async function loginSync(provider: "google" | "github") {
  localStorage.setItem("oddk.sync.login-provider", provider);
  const { error } = await syncClient().auth.signInWithOAuth({ provider, options: { redirectTo: `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/todo/` } });
  if (error) throw error;
}
export async function disconnectSync() {
  const s = session();
  if (s && cache(s).dirty) throw new Error("아직 전송하지 못한 내용이 있어요. 동기화하거나 백업한 뒤 다시 시도해주세요.");
  if (s) backup(cacheKey(s), cache(s).plan, "before-logout");
  const { error } = await syncClient().auth.signOut({ scope: "local" });
  if (error) throw error;
  localStorage.removeItem(SESSION_KEY); conflict = null; publish(INITIAL); changed();
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
