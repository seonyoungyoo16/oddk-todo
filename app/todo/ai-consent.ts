import { AI_PROCESSING_FACTS } from "./ai-policy.ts";
/** Change for notice edits; processing facts below are also compared automatically. */
export const AI_CONSENT_VERSION = "2026-11-04.1";
export const AI_CONSENT_PREFIX = "oddk.ai-consent.v1.";
export type AITarget = "gateway" | "local";
export type AIConsentContext = { scope: string; target: AITarget };
export type AIRequestPermit = { assertCurrent: () => void };
export type ConsentStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const denied = new Set<string>();
export const aiPolicyFingerprint = (target: AITarget) => JSON.stringify({ noticeVersion: AI_CONSENT_VERSION, ...AI_PROCESSING_FACTS[target] });
export function aiConsentChanges(context: AIConsentContext, storage: ConsentStorage): string[] {
  try {
    const old = JSON.parse(storage.getItem(consentKey(context)) ?? "null");
    if (!old?.granted || old.scope !== context.scope || old.target !== context.target) return [];
    if (old.version === AI_CONSENT_VERSION && old.policy === aiPolicyFingerprint(context.target)) return [];
    const previous = JSON.parse(old.policy ?? "{}");
    const next = JSON.parse(aiPolicyFingerprint(context.target));
    const labels: Record<string, string> = { noticeVersion: "안내 문구", endpoint: "전송 주소", recipient: "받는 곳", fields: "전송 항목", purpose: "처리 목적", model: "AI 모델", retention: "로그·보관 안내", authentication: "로그인 확인 방식" };
    const changes = Object.keys(next).filter(key => previous[key] !== next[key]).map(key => labels[key]);
    if (old.version !== AI_CONSENT_VERSION && !changes.includes("안내 문구")) changes.unshift("안내 문구");
    return changes;
  } catch { return []; }
}
export const consentKey = ({ scope, target }: AIConsentContext) => `${AI_CONSENT_PREFIX}${target}.${encodeURIComponent(scope)}`;
export function readAIConsent(context: AIConsentContext, storage: ConsentStorage): string | null {
  const key = consentKey(context);
  if (denied.has(key)) return null;
  const raw = storage.getItem(key);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    return value.version === AI_CONSENT_VERSION && value.policy === aiPolicyFingerprint(context.target) && value.scope === context.scope && value.target === context.target
      && value.granted === true && typeof value.id === "string" && value.id.length > 0
      && typeof value.acceptedAt === "string" && Number.isFinite(Date.parse(value.acceptedAt)) ? raw : null;
  } catch { return null; }
}
export function grantAIConsent(context: AIConsentContext, storage: ConsentStorage): void {
  const key = consentKey(context);
  // Do not unlock the network until this exact receipt can be read back.
  denied.add(key);
  const raw = JSON.stringify({ version: AI_CONSENT_VERSION, policy: aiPolicyFingerprint(context.target), scope: context.scope, target: context.target, granted: true, id: crypto.randomUUID(), acceptedAt: new Date().toISOString() });
  storage.setItem(key, raw);
  if (storage.getItem(key) !== raw) throw Error("AI 동의를 저장하지 못했어요. 전송하지 않았으며 입력은 유지했어요.");
  denied.delete(key);
}
export function revokeAIConsent(context: AIConsentContext, storage: ConsentStorage): void {
  const key = consentKey(context);
  denied.add(key);
  storage.removeItem(key);
  if (storage.getItem(key) !== null) throw Error("AI 동의 철회를 저장하지 못했어요. 현재 화면의 AI 요청은 중단했어요. 저장 설정을 확인해주세요.");
}
export function eraseAccountAIConsent(storage: ConsentStorage, userId: string): void {
  if (!userId || userId === "local" || userId === "unreadable-session") throw Error("삭제할 계정의 정보를 확인해주세요.");
  try {
    for (const target of ["gateway", "local"] as const) revokeAIConsent({ scope: userId, target }, storage);
  } catch {
    throw Error("AI 동의 기록을 지우지 못했어요. 계정 삭제 결과를 다시 확인해주세요.");
  }
}
export function requireAIConsent(context: AIConsentContext, storage: ConsentStorage, readContext: () => AIConsentContext, signal: AbortSignal): AIRequestPermit {
  const receipt = readAIConsent(context, storage);
  if (!receipt) throw Error("AI 전송 안내를 확인하고 동의해주세요. 일반 추가는 그대로 사용할 수 있어요.");
  return { assertCurrent() {
    signal.throwIfAborted();
    const latest = readContext();
    if (latest.scope !== context.scope || latest.target !== context.target || readAIConsent(context, storage) !== receipt) throw Error("AI 동의나 계정이 바뀌었어요. 전송을 중단하고 입력은 유지했어요.");
  } };
}
export function consentedFetch(permit: AIRequestPermit, fetcher: typeof fetch = fetch): typeof fetch {
  return async (input, init) => { permit.assertCurrent(); const response = await fetcher(input, init); permit.assertCurrent(); return response; };
}
