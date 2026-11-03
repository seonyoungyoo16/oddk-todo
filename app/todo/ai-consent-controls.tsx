"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { HiOutlineXMark, HiOutlineSparkles } from "react-icons/hi2";
import { AI_CONSENT_VERSION, aiConsentChanges } from "./ai-consent";
import { AI_MODEL, AI_PROCESSING_FACTS } from "./ai-policy";
import { currentAIContext, getAIConsentSnapshot, getServerAIConsentSnapshot, saveAIConsent, sameAIContext, subscribeAIConsent, withdrawAIConsent, type AIContext } from "./ai-consent-runtime";
import { keepFocusInDialog } from "./dialog-focus";

export function AIConsentDialog({ context, onClose, onConfirm, mode = "analyze" }: {
  context: AIContext; onClose: () => void; onConfirm: () => void; mode?: "analyze" | "grant" | "view";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [checked, setChecked] = useState(false), [error, setError] = useState("");
  const local = context.target === "local", base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const changes = (() => { try { return aiConsentChanges(context, localStorage); } catch { return []; } })();
  const renewal = changes.length > 0 && mode !== "view";
  useEffect(() => {
    const dialog = ref.current, opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    return () => { dialog?.close(); if (opener?.isConnected) opener.focus(); };
  }, []);
  return <dialog ref={ref} className="oddk-dialog oddk-aiConsent" aria-labelledby="ai-consent-title" aria-describedby="ai-consent-description" onKeyDown={keepFocusInDialog} onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="oddk-dialogForm">
      <header className="oddk-dialogHeader"><h2 id="ai-consent-title">{renewal ? "AI 처리 안내가 바뀌었어요" : mode === "view" ? "AI 처리 안내" : mode === "grant" ? "AI 사용을 켤까요?" : "AI로 할 일을 나눌까요?"}</h2><button type="button" aria-label="AI 안내 닫기" onClick={onClose}><HiOutlineXMark aria-hidden="true" /></button></header>
      <p id="ai-consent-description">{renewal ? "전송 대상이나 처리 항목 등 바뀐 내용을 확인해주세요. 다시 동의하기 전에는 AI 분석을 시작하지 않아요." : `입력한 문장을 ${local ? "이 기기의 Ollama" : "oddk 운영자의 AI 서버"}로 보내 할 일 후보를 만들어요. 확인한 후보만 목록에 추가돼요.`}</p>
      {renewal && <p>변경 항목: {changes.join(", ")}</p>}
      <dl className="oddk-aiConsentFacts">
        <div><dt>보내는 곳</dt><dd>{local ? "이 기기의 Ollama" : "oddk 운영자의 AI 서버"} · {AI_MODEL}</dd></div>
        <div><dt>보내는 내용</dt><dd>{local ? "분석할 입력 문장" : "분석할 입력 문장과 로그인 인증 토큰"}</dd></div>
      </dl>
      <p className="oddk-aiConsentOptional">동의하지 않아도 일반 추가와 계획은 그대로 사용할 수 있어요.</p>
      <p className="oddk-aiConsentOptional">보관 기간은 확인 중이에요.</p>
      <details className="oddk-aiConsentDetails"><summary>처리·보관 자세히</summary>
        <p>전체 목록·목표·메모를 함께 보내지 않아요.</p>
        <p>{AI_PROCESSING_FACTS[context.target].recipient} · {AI_MODEL}{local ? " · 이 경로에서는 로그인 토큰을 보내지 않아요." : " · 인증 토큰은 로그인 확인에만 쓰고 AI 모델 입력에는 포함하지 않아요."}</p>
        <p>{local ? "모델의 보관 기간은 현재 확인 중이에요." : "운영 로그·모델의 보관 기간은 현재 확인 중이에요."} 입력 내용이 어디에도 남지 않는다고 보장하지 않아요.</p>
        <p>{AI_PROCESSING_FACTS[context.target].endpoint}로 요청해요.{!local && " 게이트웨이는 Supabase에서 로그인을 확인한 뒤 운영자 PC의 모델에 입력 문장을 전달해요."}</p>
        <p>동의는 이 기기의 현재 {context.scope === "local" ? "로그인 전 공간" : "로그인 계정"}과 처리 경로에만 저장해요. 다른 계정·기기에는 적용하지 않아요. 문구나 처리 조건이 바뀌면 다시 동의받아요.</p>
        <p>설정 → 계정·동기화 → AI 분석에서 철회할 수 있어요. 철회하면 진행 중 요청과 결과 적용을 중단하고 이후 전송을 막아요. 이미 전송된 내용의 회수나 외부 로그 삭제를 뜻하지는 않아요.</p>
        <p><a href={`${base}/privacy/`} target="_blank" rel="noreferrer">개인정보처리방침</a> · <a href={`${base}/support/`} target="_blank" rel="noreferrer">지원·문의</a><span className="oddk-aiConsentVersion">안내 버전 {AI_CONSENT_VERSION}</span></p>
      </details>
      {mode !== "view" && <label className="oddk-aiConsentCheck"><input type="checkbox" checked={checked} onChange={event => setChecked(event.target.checked)} />위 내용과 전송 범위를 확인했고, AI 분석에 동의해요.</label>}
      {error && <p role="alert" className="oddk-aiSplitError">{error}</p>}
      <footer className="oddk-dialogActions"><button type="button" onClick={onClose}>{mode === "view" ? "닫기" : "지금은 안 할게요"}</button>{mode !== "view" && <button type="button" className="oddk-primary" disabled={!checked} onClick={() => { if (!checked) return; try { onConfirm(); } catch (error) { setError(error instanceof Error ? error.message : "동의를 저장하지 못했어요. 전송하지 않았어요."); } }}>{mode === "analyze" ? renewal ? "다시 동의하고 분석" : "동의하고 분석" : "동의하고 사용"}</button>}</footer>
    </div>
  </dialog>;
}

export function AIConsentNote() {
  const raw = useSyncExternalStore(subscribeAIConsent, getAIConsentSnapshot, getServerAIConsentSnapshot);
  const [dialog, setDialog] = useState<AIContext | null>(null);
  if (raw === "unavailable") return null;
  const status = JSON.parse(raw);
  return status.granted ? <><p className="oddk-aiConsentNote"><HiOutlineSparkles aria-hidden="true" />{status.target === "local" ? "AI 분석 시 입력 문장을 이 기기의 Ollama로 보내요." : "AI 분석 시 입력 문장을 oddk의 AI 서버로 보내요."}<button type="button" onClick={() => setDialog(currentAIContext())}>처리 안내</button></p>{dialog && <AIConsentDialog context={dialog} mode="view" onClose={() => setDialog(null)} onConfirm={() => {}} />}</> : null;
}

export function AIConsentSettings() {
  const raw = useSyncExternalStore(subscribeAIConsent, getAIConsentSnapshot, getServerAIConsentSnapshot);
  const status = raw === "unavailable" ? null : JSON.parse(raw);
  const [dialog, setDialog] = useState<(AIContext & { mode: "view" | "grant" }) | null>(null);
  const [notice, setNotice] = useState<{ scope: string; message: string } | null>(null);
  const feedback = !status || notice?.scope === status.scope ? notice?.message ?? "" : "";
  const setFeedback = (message: string) => setNotice({ scope: status?.scope ?? "", message });
  function openNotice(mode: "view" | "grant") {
    setFeedback("");
    try {
      const context = currentAIContext();
      if (!status || !sameAIContext(context, status)) throw Error("계정이 바뀌었어요. 현재 계정에서 다시 확인해주세요.");
      setDialog({ ...context, mode });
    } catch (error) { setFeedback((error as Error).message); }
  }
  return <div className="oddk-aiConsentSettings">
    <div className="oddk-settingActionRow"><div className="oddk-settingCopy"><strong>AI 사용</strong><p>입력한 문장을 할 일로 나눠요.</p></div><div className="oddk-aiSwitchWrap"><span aria-hidden="true">{status?.granted ? "켜짐" : "꺼짐"}</span><button type="button" className="oddk-aiSwitch" role="switch" aria-label="AI 사용" aria-checked={Boolean(status?.granted)} disabled={!status} onClick={() => {
      if (!status?.granted) { openNotice("grant"); return; }
      try {
        const context = currentAIContext();
        if (!sameAIContext(context, status)) throw Error("계정이 바뀌었어요. 현재 계정에서 다시 확인해주세요.");
        withdrawAIConsent(context); setDialog(null);
        setFeedback("AI 사용을 껐어요. 진행 중 분석과 결과 적용을 중단하고 이후 전송을 막아요.");
      } catch (error) { setFeedback((error as Error).message); }
    }}><span /></button></div></div>
    <div className="oddk-settingsCardBottom"><span>일반 추가는 AI 없이도 사용할 수 있어요.</span><button type="button" className="oddk-settingTextButton" disabled={!status} onClick={() => openNotice("view")}>처리 안내</button></div>
    {!status && <p>저장소와 계정 상태를 확인한 뒤 동의를 관리해주세요.</p>}
    <p role="status" className={feedback ? "oddk-settingsFeedback" : "oddk-srOnly"}>{feedback}</p>
    {dialog && status && sameAIContext(dialog, status) && <AIConsentDialog context={dialog} mode={dialog.mode} onClose={() => setDialog(null)} onConfirm={() => { saveAIConsent(dialog); setDialog(null); setFeedback("AI 사용을 켰어요. AI 분석을 누를 때만 입력 문장을 보내요."); }} />}
  </div>;
}
