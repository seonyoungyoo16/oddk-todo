import { eraseAccountAIConsent } from "./ai-consent.ts";

export const DELETION_KEY = "oddk.account-deletion.v1";
export type PendingDeletion = { userId: string; operation: string };
export function pendingDeletion(storage: Pick<Storage, "getItem">): PendingDeletion | null {
  const raw = storage.getItem(DELETION_KEY);
  if (!raw) return null;
  const value = JSON.parse(raw);
  if (!value || typeof value.userId !== "string" || !/^[a-f0-9]{64}$/.test(value.operation)) throw Error("계정 삭제 확인 정보를 읽지 못했어요. 문의 이메일로 연락해주세요.");
  return value;
}
export function eraseAccountData(storage: Storage, userId: string) {
  // Fail before clearing recoverable plan data if either receipt cannot be erased.
  // finishAccountDeletion removes its retry marker only after this succeeds.
  eraseAccountAIConsent(storage, userId);
  const plan = `oddk.sync.plan.${userId}`;
  const drafts = `oddk.drafts.v1.${encodeURIComponent(userId)}.`;
  const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter((key): key is string => key !== null);
  for (const key of keys) if (key === plan || key.startsWith(`${plan}.`) || key.startsWith(drafts)) storage.removeItem(key);
  const session = storage.getItem("oddk.sync.session.v1");
  if (session && JSON.parse(session).id === userId) storage.removeItem("oddk.sync.session.v1");
}
