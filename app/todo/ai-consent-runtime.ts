import { Capacitor } from "@capacitor/core";
import { usesLocalTaskAI } from "./native-options";
import { getPlanScope, hasPendingAccountDeletion, subscribePlan, subscribeSync } from "./sync-store";
import { syncClient } from "./supabase-client";
import { AI_CONSENT_PREFIX, aiConsentChanges, grantAIConsent, readAIConsent, requireAIConsent, revokeAIConsent } from "./ai-consent";
import type { AIConsentContext } from "./ai-consent";

const EVENT = "oddk-ai-consent-change";
let authEpoch = 0;
let observedAuthScope: string | undefined;
export type AIContext = AIConsentContext & { epoch: number };
export function currentAIContext(): AIContext {
  const scope = getPlanScope();
  if (scope === "unreadable-session" || hasPendingAccountDeletion()) throw Error("계정 상태를 확인한 뒤 AI를 다시 사용해주세요. 일반 입력은 유지했어요.");
  if (observedAuthScope !== undefined && observedAuthScope !== scope) throw Error("계정이 전환 중이에요. 현재 계정의 내용을 불러온 뒤 다시 분석해주세요. 입력은 유지했어요.");
  return { scope, target: usesLocalTaskAI(location.hostname, Capacitor.isNativePlatform()) ? "local" : "gateway", epoch: authEpoch };
}
export const sameAIContext = (a: AIContext, b: AIContext) => a.scope === b.scope && a.target === b.target && a.epoch === b.epoch;
export function hasAIConsent(context: AIContext) { return !!readAIConsent(context, localStorage); }
export function saveAIConsent(context: AIContext) {
  if (!sameAIContext(context, currentAIContext())) throw Error("계정이 바뀌었어요. 현재 계정에서 안내를 다시 확인해주세요.");
  try { grantAIConsent(context, localStorage); }
  catch { throw Error("AI 동의를 저장하지 못했어요. 전송하지 않았으며 입력은 유지했어요."); }
  finally { window.dispatchEvent(new Event(EVENT)); }
}
export function withdrawAIConsent(context: AIContext) {
  // Notify even if storage is unavailable: current requests must still be cancelled.
  try { revokeAIConsent(context, localStorage); }
  catch { throw Error("AI 동의 철회를 저장하지 못했어요. 현재 화면의 AI 요청은 중단했어요. 저장 설정을 확인해주세요."); }
  finally { window.dispatchEvent(new Event(EVENT)); }
}
export function aiRequestPermit(context: AIContext, signal: AbortSignal) {
  const permit = requireAIConsent(context, localStorage, currentAIContext, signal);
  return { assertCurrent() {
    if (!sameAIContext(context, currentAIContext())) throw Error("계정이 바뀌어 AI 분석을 중단했어요. 입력은 유지했어요.");
    permit.assertCurrent();
  } };
}
export function subscribeAIConsent(notify: () => void) {
  const changed = () => notify();
  const storageChanged = (event: StorageEvent) => { if (event.key === null || event.key.startsWith(AI_CONSENT_PREFIX)) notify(); };
  const stopPlan = subscribePlan(changed), stopSync = subscribeSync(changed);
  let owner = getPlanScope();
  const { data } = syncClient().auth.onAuthStateChange((_event, session) => {
    const next = session?.user.id ?? "local";
    observedAuthScope = next;
    if (owner !== next) { owner = next; authEpoch++; }
    // Synchronous callback only; never call async auth methods under the auth lock.
    notify();
  });
  window.addEventListener(EVENT, changed); window.addEventListener("storage", storageChanged); window.addEventListener("focus", changed);
  return () => { stopPlan(); stopSync(); data.subscription.unsubscribe(); window.removeEventListener(EVENT, changed); window.removeEventListener("storage", storageChanged); window.removeEventListener("focus", changed); };
}
export function getAIConsentSnapshot() {
  try { const context = currentAIContext(); return JSON.stringify({ ...context, granted: hasAIConsent(context), changes: aiConsentChanges(context, localStorage) }); }
  catch { return "unavailable"; }
}
export const getServerAIConsentSnapshot = () => "unavailable";
