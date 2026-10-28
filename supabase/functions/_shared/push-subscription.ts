// Shared parsing only; it never requests a permission or contacts a push service.
export type BrowserPushSubscription = { endpoint: string; keys: { p256dh: string; auth: string } };
export type PushDeviceRequest = { installationId: string; deviceToken: string };
export type PushSubscriptionRequest = { action: "config" } | { action: "devices" } | { action: "revoke"; installationId: string; revision: number } | ({ action: "status" } & PushDeviceRequest) |
  ({ action: "disable"; revision: number } & PushDeviceRequest) |
  ({ action: "register"; revision: number; label: string; subscription: BrowserPushSubscription } & PushDeviceRequest);
export type PushDeviceState = { revision: number; enabled: boolean; owned: boolean; label: string | null };
export type PushDeviceSummary = { installationId: string; revision: number; label: string; enabled: boolean; updatedAt: string };
const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
export function decodeBase64url(value: unknown, size: number): Uint8Array | null {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value) || value.length !== Math.ceil(size * 4 / 3)) return null;
  try {
    const bytes = Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - value.length % 4) % 4)), c => c.charCodeAt(0));
    return bytes.byteLength === size && base64url(bytes) === value ? bytes : null;
  } catch { return null; }
}
export function isPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== "string" || endpoint.length < 40 || endpoint.length > 2048 || /[\\\s\u0000-\u001f]/u.test(endpoint)) return false;
  try {
    const url = new URL(endpoint);
    if (url.href !== endpoint || url.protocol !== "https:" || url.port || url.username || url.password || url.search || url.hash || /%/u.test(url.pathname)) return false;
    const token = "[A-Za-z0-9_:\\-]+";
    return url.hostname === "fcm.googleapis.com" && new RegExp(`^/(?:fcm/send|wp)/${token}$`).test(url.pathname) ||
      url.hostname === "updates.push.services.mozilla.com" && new RegExp(`^/wpush/v[12]/${token}$`).test(url.pathname) ||
      url.hostname === "web.push.apple.com" && new RegExp(`^/${token}$`).test(url.pathname);
  } catch { return false; }
}
export function parsePushSubscriptionRequest(value: unknown): PushSubscriptionRequest | null {
  if (!record(value)) return null;
  if (value.action === "config" || value.action === "devices") return Object.keys(value).length === 1 ? { action: value.action } : null;
  if (value.action === "revoke") return Object.keys(value).length === 3 && typeof value.installationId === "string" && uuid.test(value.installationId) && typeof value.revision === "number" && Number.isSafeInteger(value.revision) && value.revision >= 1 && value.revision < Number.MAX_SAFE_INTEGER ? { action: "revoke", installationId: value.installationId, revision: value.revision } : null;
  if (typeof value.installationId !== "string" || !uuid.test(value.installationId) || !decodeBase64url(value.deviceToken, 32)) return null;
  const device = { installationId: value.installationId, deviceToken: value.deviceToken as string };
  if (value.action === "status") return Object.keys(value).length === 3 ? { action: "status", ...device } : null;
  if (typeof value.revision !== "number" || !Number.isSafeInteger(value.revision) || value.revision < 0 || value.revision >= Number.MAX_SAFE_INTEGER) return null;
  if (value.action === "disable") return Object.keys(value).length === 4 ? { action: "disable", revision: value.revision, ...device } : null;
  const subscription = value.subscription;
  if (value.action !== "register" || Object.keys(value).length !== 6 || typeof value.label !== "string" || !value.label.trim() || value.label.length > 60 || /[\u0000-\u001f\u007f]/u.test(value.label) || !record(subscription) || Object.keys(subscription).length !== 2 || !isPushEndpoint(subscription.endpoint) || !record(subscription.keys) || Object.keys(subscription.keys).length !== 2 || !decodeBase64url(subscription.keys.auth, 16)) return null;
  const point = decodeBase64url(subscription.keys.p256dh, 65);
  if (!point || point[0] !== 4) return null;
  return { action: "register", revision: value.revision, label: value.label.trim(), ...device, subscription: { endpoint: subscription.endpoint, keys: { p256dh: subscription.keys.p256dh as string, auth: subscription.keys.auth as string } } };
}
export async function validPushPoint(publicKey: string): Promise<boolean> {
  const point = decodeBase64url(publicKey, 65);
  if (!point) return false;
  try {
    const publicKey = await crypto.subtle.importKey("raw", point as Uint8Array<ArrayBuffer>, { name: "ECDH", namedCurve: "P-256" }, false, []);
    // Some runtimes accept an off-curve point at import and reject it only when
    // used. Exercise the platform primitive instead of implementing curve math.
    const probe = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
    const shared = await crypto.subtle.deriveBits({ name: "ECDH", public: publicKey }, probe.privateKey, 256);
    return shared.byteLength === 32;
  } catch { return false; }
}
export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}
export async function createVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const [raw, privateKey] = await Promise.all([crypto.subtle.exportKey("raw", keys.publicKey), crypto.subtle.exportKey("jwk", keys.privateKey)]);
  if (!privateKey.d) throw new Error("VAPID key unavailable");
  return { publicKey: base64url(new Uint8Array(raw)), privateKey: privateKey.d };
}
