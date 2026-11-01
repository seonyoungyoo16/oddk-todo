"use client";
import { useRef, useState } from "react";
import type { RefObject } from "react";
import { HiOutlineXMark } from "react-icons/hi2";
import { deleteSyncAccount, exportPlanBackup, recoverAccountDeletion, loginSync } from "./sync-store";
import { keepFocusInDialog } from "./dialog-focus";
import { AppleLoginButton } from "./apple-login-button";

export function AccountDeletionDialog({ dialogRef, account, fallback, pending, onDeleted }: {
  dialogRef: RefObject<HTMLDialogElement | null>; account: string; fallback: string; pending: boolean; onDeleted: () => void;
}) {
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const inFlight = useRef(false);
  function reauthenticate(provider: "apple" | "google" | "github") {
    setBusy(true); setMessage("");
    void loginSync(provider).catch(error => setMessage(error instanceof Error ? error.message : "로그인을 시작하지 못했어요.")).finally(() => setBusy(false));
  }
  async function perform(checkOnly = false) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setMessage("");
    try {
      if (checkOnly) await recoverAccountDeletion(); else await deleteSyncAccount();
      setConfirmation(""); dialogRef.current?.close(); onDeleted();
    } catch (error) { setMessage(error instanceof Error ? error.message : "삭제 결과를 확인하지 못했어요."); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <dialog ref={dialogRef} className="oddk-dialog oddk-accountDeletion" aria-labelledby="account-deletion-title" aria-describedby="account-deletion-description" onKeyDown={keepFocusInDialog} onCancel={event => { if (busy) event.preventDefault(); }} onClose={() => { setConfirmation(""); setMessage(""); }}>
    <form className="oddk-dialogForm" onSubmit={event => { event.preventDefault(); if (pending || confirmation === "계정 삭제") void perform(); }}>
      <header className="oddk-dialogHeader"><h2 id="account-deletion-title">계정 삭제</h2><button type="button" disabled={busy} aria-label="계정 삭제 창 닫기" onClick={() => dialogRef.current?.close()}><HiOutlineXMark /></button></header>
      <p className="oddk-deletionAccount">{account || "진행 중인 계정 삭제 요청"}</p>
      <p id="account-deletion-description">이 계정의 할 일, 목표, 하루 점검, 시간 기록과 알림 연결을 서버에서 삭제해요. 이 기기의 계정 저장본과 초안도 삭제하며 되돌릴 수 없어요.</p>
      <p>로그인 전 이 기기의 목록, 다른 계정의 내용, 직접 내려받은 백업 파일은 유지돼요. 다른 기기에 남은 오프라인 저장본은 해당 기기에서도 정리해주세요.</p>
      {!pending && <><button type="button" className="oddk-settingTextButton" disabled={busy} onClick={() => { try { exportPlanBackup(fallback); setMessage("백업 파일을 준비했어요. 파일을 확인한 뒤 진행해주세요."); } catch (error) { setMessage((error as Error).message); } }}>삭제 전 현재 내용 백업</button><label className="oddk-dialogField"><span>계속하려면 ‘계정 삭제’를 입력하세요.</span><input autoComplete="off" value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={busy} placeholder="계정 삭제" /></label></>}
      {pending && <p>이전에 요청한 삭제 결과를 확인해요. 연결이 끊겼더라도 같은 요청으로 다시 시도할 수 있어요.</p>}
      {pending && <details><summary>로그인이 만료됐나요?</summary><p>삭제를 요청했던 계정으로 다시 로그인한 뒤 같은 요청을 확인하세요.</p><div className="oddk-syncActions"><AppleLoginButton className="oddk-settingTextButton" disabled={busy} label="Apple로 다시 로그인" onClick={() => reauthenticate("apple")} /><button type="button" disabled={busy} onClick={() => reauthenticate("google")}>Google로 다시 로그인</button><button type="button" disabled={busy} onClick={() => reauthenticate("github")}>GitHub로 다시 로그인</button></div></details>}
      <p className="oddk-syncFeedback" role="status" aria-live="polite">{message || (busy ? "계정 삭제 결과를 확인하고 있어요…" : "")}</p>
      {!pending && message.includes("Apple") && <AppleLoginButton className="oddk-syncLogin" disabled={busy} label="Apple로 다시 로그인" onClick={() => reauthenticate("apple")} />}
      <div className="oddk-dialogActions"><button type="button" disabled={busy} onClick={() => dialogRef.current?.close()}>닫기</button>{pending && <button type="button" disabled={busy} onClick={() => void perform(true)}>결과 확인</button>}<button type="submit" className="oddk-dangerButton" disabled={busy || (!pending && confirmation !== "계정 삭제")}>{busy ? "확인 중…" : pending ? "삭제 다시 시도" : "계정 영구 삭제"}</button></div>
      <a href="mailto:seonyoungyoo16@gmail.com">계정 삭제 문의</a>
    </form>
  </dialog>;
}
