// Local UI drafts never enter the synchronized plan or another account's scope.
export type DraftEnvelope<T> = { version: 1; updatedAt: string; data: T };
export type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export const draftKey = (scope: string, slot: string) => `oddk.drafts.v1.${encodeURIComponent(scope)}.${encodeURIComponent(slot)}`;
export function decodeDraft<T>(raw: string | null, valid: (value: unknown) => value is T): DraftEnvelope<T> | null {
  if (raw === null) return null;
  const value = JSON.parse(raw);
  if (!value || value.version !== 1 || typeof value.updatedAt !== "string" || !Number.isFinite(Date.parse(value.updatedAt)) || !valid(value.data)) throw new Error("초안 형식을 읽을 수 없어요. 원문을 보관한 뒤 확인해주세요.");
  return value;
}
export function saveDraft<T>(storage: DraftStorage, scope: string, slot: string, data: T, valid: (value: unknown) => value is T) {
  if (!valid(data)) throw new Error("초안 형식을 확인해주세요.");
  const key = draftKey(scope, slot);
  // Do not overwrite an unreadable/future draft with an empty initial value.
  decodeDraft(storage.getItem(key), valid);
  const envelope: DraftEnvelope<T> = { version: 1, updatedAt: new Date().toISOString(), data };
  const raw = JSON.stringify(envelope);
  if (new TextEncoder().encode(raw).length > 1000000) throw new Error("초안이 너무 커요. 내용을 복사해 보관해주세요.");
  storage.setItem(key, raw);
  return envelope;
}
export function removeDraft(storage: DraftStorage, scope: string, slot: string) {
  storage.removeItem(draftKey(scope, slot));
}
