import { syncClient } from "./supabase-client";

const endpoint = "https://synxmskamifpovuziecx.supabase.co/functions/v1/push-subscriptions";
export type PushBinding = { installationId: string; deviceToken: string; epoch: string; userId: string | null; revision: number; enabled: boolean; seen: { id: string; until: number }[] };
export type PushDevice = { installationId: string; revision: number; label: string; enabled: boolean; updatedAt: string };
type DeviceStatus = { revision: number; enabled: boolean; owned: boolean; label: string | null };
const scopeUrl = () => new URL(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/`, window.location.origin).href;
export function pushSupported() { return typeof window !== "undefined" && window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window; }

async function worker(create = false) {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  const scope = scopeUrl(), script = new URL("oddk-push-sw.js", scope).href;
  let registration = await navigator.serviceWorker.getRegistration(scope);
  if (registration?.scope !== scope) registration = undefined;
  const existing = registration?.active ?? registration?.waiting ?? registration?.installing;
  if (existing && existing.scriptURL !== script) throw new Error("이 사이트의 기존 알림 연결을 확인해야 해요.");
  if (!registration && create) registration = await navigator.serviceWorker.register(script, { scope, updateViaCache: "none" });
  if (!registration) return null;
  const target = registration.installing ?? registration.waiting ?? registration.active;
  if (!target) throw new Error("알림 연결을 준비하지 못했어요.");
  if (target.state !== "activated") await new Promise<void>((resolve, reject) => {
    const clean = () => { clearTimeout(timer); target.removeEventListener("statechange", listener); };
    const listener = () => { if (target.state === "activated") { clean(); resolve(); } else if (target.state === "redundant") { clean(); reject(new Error("알림 연결을 다시 시도해주세요.")); } };
    const timer = setTimeout(() => { clean(); reject(new Error("알림 연결 준비가 지연돼요. 다시 시도해주세요.")); }, 10000);
    target.addEventListener("statechange", listener); listener();
  });
  return registration;
}
function message(registration: ServiceWorkerRegistration, body: object): Promise<PushBinding> {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const clean = () => { clearTimeout(timer); channel.port1.close(); };
    const timer = setTimeout(() => { clean(); reject(new Error("알림 상태를 저장하지 못했어요. 다시 시도해주세요.")); }, 6000);
    channel.port1.onmessage = event => {
      clean(); const value = event.data;
      if (!value?.ok || !value.state || typeof value.state.installationId !== "string" || typeof value.state.deviceToken !== "string" || typeof value.state.epoch !== "string" || !Number.isSafeInteger(value.state.revision) || typeof value.state.enabled !== "boolean") { reject(new Error("알림 연결 상태가 바뀌었어요. 다시 확인해주세요.")); return; }
      resolve(value.state);
    };
    if (!registration.active) { clean(); reject(new Error("알림 연결을 다시 준비해주세요.")); return; }
    registration.active.postMessage(body, [channel.port2]);
  });
}
async function auth(expected: string) {
  const result = await syncClient().auth.getSession();
  if (result.error || !result.data.session || result.data.session.user.id !== expected) throw new Error("로그인한 계정을 다시 확인해주세요.");
  return result.data.session;
}
async function api<T>(userId: string, body: object): Promise<T> {
  const session = await auth(userId);
  const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(body), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12000) });
  const result = await response.json();
  if (!response.ok) throw new Error(response.status === 409 ? "다른 창에서 알림 연결을 변경했어요. 상태를 다시 확인해주세요." : response.status === 429 ? "연결 가능한 기기 수에 도달했어요. 사용하지 않는 기기를 해제해주세요." : "알림 서버에 연결하지 못했어요. 잠시 후 다시 시도해주세요.");
  await auth(userId); return result as T;
}
const proof = (state: PushBinding) => ({ installationId: state.installationId, deviceToken: state.deviceToken });
export async function clearPushBinding() {
  const registration = await worker();
  if (registration) await message(registration, { action: "block" });
}
export async function alignPushBinding(userId: string | null) {
  const registration = await worker(); if (!registration) return;
  const current = await syncClient().auth.getSession();
  if (current.error) throw new Error("로그인 상태를 다시 확인해주세요.");
  if ((current.data.session?.user.id ?? null) !== userId) return;
  const state = await message(registration, { action: "state" });
  if (state.enabled && state.userId !== userId) {
    try { await message(registration, { action: "block", epoch: state.epoch }); }
    catch (error) { const latest = await message(registration, { action: "state" }); if (latest.enabled && latest.userId !== userId) throw error; }
  }
}
export async function inspectPush(userId: string): Promise<{ enabled: boolean; installationId: string | null }> {
  await auth(userId);
  const registration = await worker();
  if (!registration) return { enabled: false, installationId: null };
  const state = await message(registration, { action: "state" });
  if (!state.enabled) return { enabled: false, installationId: state.installationId };
  if (state.userId !== userId || !pushSupported() || Notification.permission !== "granted" || !await registration.pushManager.getSubscription()) {
    await auth(userId); await message(registration, { action: "block", epoch: state.epoch }); return { enabled: false, installationId: state.installationId };
  }
  const status = await api<DeviceStatus>(userId, { action: "status", ...proof(state) });
  if (!status.enabled || !status.owned || status.revision !== state.revision) { await message(registration, { action: "block", epoch: state.epoch }); return { enabled: false, installationId: state.installationId }; }
  const latest = await message(registration, { action: "state" });
  return { enabled: latest.enabled && latest.userId === userId && latest.epoch === state.epoch, installationId: state.installationId };
}
export async function enablePush(userId: string) {
  if (!pushSupported()) throw new Error("이 브라우저에서는 알림을 지원하지 않아요. iPhone·iPad는 홈 화면에 추가한 앱에서 확인해주세요.");
  // Called directly by a button; request permission before yielding the user gesture.
  const permission = await (Notification.permission === "granted" ? Promise.resolve("granted") : Notification.requestPermission());
  if (permission !== "granted") throw new Error(permission === "denied" ? "브라우저 설정에서 이 사이트의 알림을 허용한 뒤 다시 켜주세요." : "알림 권한을 허용하면 이 기기에 연결할 수 있어요.");
  await auth(userId);
  const registration = await worker(true); if (!registration) throw new Error("알림을 지원하지 않는 환경이에요.");
  const before = await message(registration, { action: "state" });
  await auth(userId);
  const state = await message(registration, { action: "block", epoch: before.epoch });
  const [config, status] = await Promise.all([api<{ publicKey: string }>(userId, { action: "config" }), api<DeviceStatus>(userId, { action: "status", ...proof(state) })]);
  const key = Uint8Array.from(atob(config.publicKey.replaceAll("-", "+").replaceAll("_", "/")), character => character.charCodeAt(0));
  if (key.length !== 65 || key[0] !== 4) throw new Error("알림 공개 키를 확인하지 못했어요.");
  let subscription = await registration.pushManager.getSubscription();
  const oldKey = subscription?.options.applicationServerKey;
  if (subscription && (!oldKey || !new Uint8Array(oldKey).every((byte, index) => byte === key[index]) || oldKey.byteLength !== key.length)) {
    if (!await subscription.unsubscribe()) throw new Error("이전 알림 연결을 해제한 뒤 다시 시도해주세요.");
    subscription = null;
  }
  subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  const serialized = subscription.toJSON();
  const result = await api<DeviceStatus>(userId, { action: "register", ...proof(state), revision: status.revision, label: "이 브라우저", subscription: { endpoint: serialized.endpoint, keys: serialized.keys } });
  if (!result.enabled || !result.owned) throw new Error("기기 연결 상태를 다시 확인해주세요.");
  await auth(userId);
  await message(registration, { action: "bind", userId, revision: result.revision, epoch: state.epoch });
}
export async function disablePush(userId: string) {
  await auth(userId);
  const registration = await worker(); if (!registration) return;
  const before = await message(registration, { action: "state" });
  await auth(userId);
  if (before.enabled && before.userId !== userId) throw new Error("로그인한 계정을 다시 확인해주세요.");
  const state = await message(registration, { action: "block", epoch: before.epoch });
  // Local blocking commits first; network failure cannot expose an old title.
  try {
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) await subscription.unsubscribe();
    const status = await api<DeviceStatus>(userId, { action: "status", ...proof(state) });
    if (status.owned) await api(userId, { action: "disable", ...proof(state), revision: status.revision });
  } catch { throw new Error("이 기기 수신은 차단했어요. 서버 연결 해제는 온라인에서 다시 시도해주세요."); }
}
export async function stopPushForLogout(userId: string) {
  await auth(userId);
  // A failed local write blocks logout; remote cleanup can be retried after login.
  await clearPushBinding();
  try { await disablePush(userId); } catch { /* Durable local block remains effective offline. */ }
}
export async function pushDevices(userId: string) {
  const result = await api<{ devices: PushDevice[] }>(userId, { action: "devices" });
  return result.devices.filter(device => device.enabled);
}
export async function revokePushDevice(userId: string, device: PushDevice, installationId: string | null) {
  await auth(userId);
  if (device.installationId === installationId) {
    const registration = await worker();
    if (registration) {
      const state = await message(registration, { action: "state" });
      await auth(userId);
      if (state.enabled && state.userId !== userId) throw new Error("로그인한 계정을 다시 확인해주세요.");
      await message(registration, { action: "block", epoch: state.epoch });
    }
  }
  await api(userId, { action: "revoke", installationId: device.installationId, revision: device.revision });
  if (device.installationId === installationId) {
    const registration = await worker(), subscription = await registration?.pushManager.getSubscription();
    if (subscription) await subscription.unsubscribe();
  }
}
