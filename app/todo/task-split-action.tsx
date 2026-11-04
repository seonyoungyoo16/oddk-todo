"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Capacitor } from "@capacitor/core";
import { usesLocalTaskAI } from "./native-options";
import { HiOutlinePlus, HiOutlineSparkles } from "react-icons/hi2";
import { prepareManualTask } from "./batch-tasks";
import { splitWithLocalAI } from "./local-task-ai";
import { splitWithRemoteAI } from "./remote-task-ai";
import { syncClient } from "./supabase-client";
import { TaskSplitReview } from "./task-split-review";
import { restoreDialogFocus } from "./dialog-focus";
import { AIConsentDialog, AIConsentNote } from "./ai-consent-controls";
import { consentedFetch, type AIRequestPermit } from "./ai-consent";
import { aiRequestPermit, currentAIContext, hasAIConsent, sameAIContext, saveAIConsent, subscribeAIConsent, type AIContext } from "./ai-consent-runtime";
export function TaskSplitAction({ source, disabled, onAdd, onBusyChange, onSourceSnapshot, children }: {
  source: string; disabled: boolean; onAdd: (titles: string[], original?: string) => string | null; onBusyChange: (busy: boolean) => void; onSourceSnapshot: (source: string) => void; children: ReactNode;
}) {
  const request = useRef<AbortController | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const activePermit = useRef<AIRequestPermit | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null), confirming = useRef(false);
  const currentText = () => formRef.current?.querySelector<HTMLTextAreaElement>("textarea")?.value ?? source;
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [preview, setPreview] = useState<{ source: string; titles: string[]; permit: AIRequestPermit } | null>(null);
  const [analysis, setAnalysis] = useState<{ source: string; opener: HTMLElement | null } | null>(null);
  const [consent, setConsent] = useState<{ context: AIContext; source: string } | null>(null);
  useEffect(() => subscribeAIConsent(() => {
    try { activePermit.current?.assertCurrent(); }
    catch {
      const current = request.current; request.current = null; current?.abort(); activePermit.current = null;
      setBusy(false); if (current) onBusyChange(false);
      setPreview(null); setError("AI 동의나 계정이 바뀌어 분석을 중단했어요. 입력은 유지했어요.");
    }
    setConsent(current => {
      if (!current) return current;
      try { if (sameAIContext(current.context, currentAIContext())) return current; } catch { /* fail closed */ }
      return null;
    });
  }), [onBusyChange]);
  useEffect(() => () => { const current = request.current; request.current = null; current?.abort(); onBusyChange(false); }, [onBusyChange]);
  function closeAnalysis() {
    const current = request.current; request.current = null; current?.abort(); activePermit.current = null;
    setBusy(false); if (current) onBusyChange(false);
    setPreview(null); setAnalysis(null); setError("");
  }
  function addManually() {
    if (disabled || request.current) return;
    const submitted = currentText();
    if (!submitted.trim()) return;
    if (submitted !== source) onSourceSnapshot(submitted);
    setError("");
    try {
      const task = prepareManualTask(submitted);
      const message = onAdd([task.title], task.original);
      if (message) setError(message);
      else requestAnimationFrame(() => restoreDialogFocus(document.getElementById("todo-input")));
    } catch (error) { setError((error as Error).message); }
  }
  async function split(expected?: AIContext) {
    const submitted = currentText();
    if (disabled || request.current || !submitted.trim()) return;
    // Keep the IME's last visible character before opening even the consent UI.
    if (submitted !== source) onSourceSnapshot(submitted);
    let context: AIContext;
    try {
      context = currentAIContext();
      if (expected && !sameAIContext(expected, context)) throw Error("계정이 바뀌었어요. 현재 계정에서 다시 분석해주세요.");
      if (context.target === "gateway" && context.scope === "local") throw Error("AI 분석은 로그인 후 사용할 수 있어요. 일반 추가는 로그인 없이 가능해요.");
      if (!hasAIConsent(context)) { setError(""); setConsent({ context, source: submitted }); return; }
    } catch (error) { setError((error as Error).message); return; }
    const controller = new AbortController(); request.current = controller;
    confirming.current = false; setAnalysis({ source: submitted, opener: triggerRef.current }); setPreview(null);
    setBusy(true); onBusyChange(true); setError("");
    let previewReady = false;
    try {
      const authorization = aiRequestPermit(context, controller.signal);
      const permit = { assertCurrent() {
        authorization.assertCurrent();
        if (currentText().trim() !== submitted.trim()) throw Error("입력 내용이 바뀌었어요. 현재 내용으로 다시 분석해주세요. 입력은 유지했어요.");
      } }; activePermit.current = permit;
      const local = usesLocalTaskAI(location.hostname, Capacitor.isNativePlatform());
      const session = local ? null : (await syncClient().auth.getSession()).data.session;
      permit.assertCurrent();
      if (!local && (!session || session.user.id !== context.scope)) throw Error("로그인 계정이 바뀌었어요. 현재 계정에서 다시 분석해주세요.");
      const fetcher = consentedFetch(permit);
      const titles = local ? await splitWithLocalAI(submitted, controller.signal, location.hostname, fetcher)
        : await splitWithRemoteAI(submitted, controller.signal, session?.access_token ?? null, permit, fetcher);
      if (request.current !== controller || controller.signal.aborted) return;
      permit.assertCurrent();
      if (!local && (await syncClient().auth.getSession()).data.session?.user.id !== session?.user.id) throw Error("로그인 계정이 바뀌었어요. 현재 계정에서 다시 추가해주세요.");
      permit.assertCurrent();
      if (!controller.signal.aborted) {
        if (currentText().trim() !== submitted.trim()) throw Error("다른 화면에서 입력 내용이 바뀌었어요. 내용을 확인하고 추가를 다시 눌러주세요.");
        setPreview({ source: submitted, titles, permit }); previewReady = true;
      }
    } catch (error) { if (request.current === controller && !controller.signal.aborted) setError((error as Error).message); }
    finally { if (request.current === controller) { request.current = null; if (!previewReady) activePermit.current = null; setBusy(false); onBusyChange(false); } }
  }
  return <form ref={formRef} className="oddk-addForm" onInput={() => setError("")} onSubmit={event => { event.preventDefault(); if (event.target === event.currentTarget) addManually(); }}>
    {children}
    <div className="oddk-composerFooter">
      <small id="todo-input-count" className="oddk-inputCount">{source.length > 0 ? `${source.length}/2000` : ""}</small>
      <button ref={triggerRef} type="button" className="oddk-aiAnalyze" aria-label="AI 분석" aria-busy={busy} aria-disabled={disabled || busy || !source.trim()} title="AI로 내용을 나누고 확인한 뒤 추가해요" disabled={disabled || busy} onClick={() => void split()}><HiOutlineSparkles aria-hidden="true" />AI 분석</button>
      <button type="submit" aria-label="할 일 추가" disabled={disabled || busy || !source.trim()}><HiOutlinePlus aria-hidden="true" />추가</button>
      {source.length > 120 && <p className="oddk-manualNote">제목은 앞 120자, 전체 내용은 메모로 보관해요.</p>}
      {error && <p className="oddk-aiSplitError" role="alert">{error}</p>}
    </div>
    <AIConsentNote />
    {consent && createPortal(<AIConsentDialog context={consent.context} onClose={() => setConsent(null)} onConfirm={() => {
      if (currentText() !== consent.source) throw Error("입력 내용이 바뀌었어요. 닫은 뒤 현재 내용으로 다시 분석해주세요.");
      saveAIConsent(consent.context); setConsent(null); void split(consent.context);
    }} />, document.querySelector(".oddk-page") ?? document.body)}
    {analysis && createPortal(<TaskSplitReview source={analysis.source} candidates={preview?.titles ?? []} phase={busy ? "busy" : preview ? "result" : "error"} message={error} opener={analysis.opener} onRetry={() => void split()} onCancel={closeAnalysis} onAdd={titles => {
      if (!preview || confirming.current || activePermit.current !== preview.permit) return "분석 결과를 다시 확인해주세요. 입력은 유지했어요.";
      try { preview.permit.assertCurrent(); } catch (error) { return (error as Error).message; }
      if (currentText().trim() !== preview.source.trim()) return "입력 내용이 바뀌었어요. 취소 후 현재 내용으로 다시 추가해주세요.";
      confirming.current = true;
      try { const message = onAdd(titles, preview.source); if (!message) closeAnalysis(); else confirming.current = false; return message; }
      catch (error) { confirming.current = false; return (error as Error).message; }
    }} />, document.querySelector(".oddk-page") ?? document.body)}
  </form>;
}
