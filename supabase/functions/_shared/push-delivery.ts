import { base64url, decodeBase64url, isPushEndpoint, validPushPoint } from "./push-subscription.ts";
import type { BrowserPushSubscription } from "./push-subscription.ts";
import type { ReminderWindow } from "./push-reminder.ts";
export const isUuid = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
export const isHexToken = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
export const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
export type DeliveryClaim = ReminderWindow & { id: string; lease: string; reminderId: string; userId: string; taskId: string; installationId: string; revision: number; receiptToken: string };
export type VapidKeys = { publicKey: string; privateKey: string };
export type PushPayload = { v: 1; deliveryId: string; receiptToken: string; userId: string; installationId: string; revision: number; expiresAt: string };
export function parsePushPayload(v: unknown): PushPayload | null {
  if (!isRecord(v) || Object.keys(v).length !== 7 || v.v !== 1 || ![v.deliveryId, v.userId, v.installationId].every(isUuid) || !isHexToken(v.receiptToken) || !Number.isSafeInteger(v.revision) || (v.revision as number) < 1 || (v.revision as number) >= Number.MAX_SAFE_INTEGER || typeof v.expiresAt !== "string" || v.expiresAt.length > 40 || !Number.isFinite(Date.parse(v.expiresAt)) || new Date(v.expiresAt).toISOString() !== v.expiresAt) return null;
  return { v: 1, deliveryId: v.deliveryId as string, receiptToken: v.receiptToken as string, userId: v.userId as string, installationId: v.installationId as string, revision: v.revision as number, expiresAt: v.expiresAt };
}
export function validDeliveryClaim(v: unknown): v is DeliveryClaim {
  if (!isRecord(v) || ![v.id, v.lease, v.reminderId, v.userId, v.installationId].every(isUuid) || !isHexToken(v.receiptToken) || typeof v.taskId !== "string" || !v.taskId || !Number.isSafeInteger(v.revision) || (v.revision as number) < 1 || (v.revision as number) >= Number.MAX_SAFE_INTEGER) return false;
  if (![v.startAt, v.dueAt, v.expiresAt].every(t => typeof t === "string" && Number.isFinite(Date.parse(t)))) return false;
  const start = Date.parse(v.startAt as string), due = Date.parse(v.dueAt as string), expiry = Date.parse(v.expiresAt as string);
  return [0, 5, 10, 15, 30, 60].includes((start - due) / 60000) && expiry > due && expiry <= Math.min(start + 120000, due + 300000);
}
export function deliveryPayload(claim: DeliveryClaim): PushPayload {
  return { v: 1, deliveryId: claim.id, receiptToken: claim.receiptToken, userId: claim.userId, installationId: claim.installationId, revision: claim.revision, expiresAt: new Date(claim.expiresAt).toISOString() };
}
export async function transportSubscription(v: unknown): Promise<BrowserPushSubscription | null> {
  if (!isRecord(v) || !isPushEndpoint(v.endpoint) || !isRecord(v.keys) || !decodeBase64url(v.keys.auth, 16) || typeof v.keys.p256dh !== "string" || !await validPushPoint(v.keys.p256dh)) return null;
  return { endpoint: v.endpoint, keys: { p256dh: v.keys.p256dh, auth: v.keys.auth as string } };
}
export async function validVapidKeys(keys: unknown): Promise<boolean> {
  if (!isRecord(keys)) return false;
  const point = decodeBase64url(keys.publicKey, 65), privateBytes = decodeBase64url(keys.privateKey, 32);
  if (!point || point[0] !== 4 || !privateBytes) return false;
  try {
    const privateKey = await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", x: base64url(point.slice(1, 33)), y: base64url(point.slice(33)), d: keys.privateKey as string }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
    const publicKey = await crypto.subtle.importKey("raw", point as Uint8Array<ArrayBuffer>, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const probe = new TextEncoder().encode("oddk-vapid-key-check");
    const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, probe);
    return await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, publicKey, signature, probe);
  } catch { return false; }
}
export type ReceiptRequest = { action: "check" | "ack"; deliveryId: string; receiptToken: string; installationId: string; deviceToken: string; userId: string; revision: number };
export function parseReceiptRequest(v: unknown): ReceiptRequest | null {
  if (!isRecord(v) || Object.keys(v).length !== 7 || !["check", "ack"].includes(v.action as string) || ![v.deliveryId, v.installationId, v.userId].every(isUuid) || !isHexToken(v.receiptToken) || !decodeBase64url(v.deviceToken, 32) || !Number.isSafeInteger(v.revision) || (v.revision as number) < 1 || (v.revision as number) >= Number.MAX_SAFE_INTEGER) return null;
  return { action: v.action as "check" | "ack", deliveryId: v.deliveryId as string, receiptToken: v.receiptToken as string, installationId: v.installationId as string, deviceToken: v.deviceToken as string, userId: v.userId as string, revision: v.revision as number };
}
