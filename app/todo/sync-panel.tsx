"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { HiOutlineCloud } from "react-icons/hi2";
import { SiApple, SiGoogle, SiGithub } from "react-icons/si";
import { AccountDeletionDialog } from "./account-deletion-dialog";
import { AppleLoginButton } from "./apple-login-button";
import { loginSync, startSync, getSyncSnapshot, getServerSyncSnapshot, subscribeSync } from "./sync-store";
import type { SyncStatus } from "./sync-store";
import { openDialogWithFocus } from "./dialog-focus";
import { subscribeSettingsDialog, openSettingsDialog } from "./settings-events";
import { syncStatusLabel } from "./account-settings";

export function SyncPanel({ fallback, onAccountDialogChange, onShowProfile }: { fallback: string; onAccountDialogChange?: (open: boolean) => void; onShowProfile?: () => void }) {
  const raw = useSyncExternalStore(subscribeSync, getSyncSnapshot, getServerSyncSnapshot);
  const state: SyncStatus = JSON.parse(raw);
  const deletionDialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const inFlight = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => startSync(fallback), [fallback]);
  useEffect(() => {
    const element = deletionDialog.current;
    const changed = () => onAccountDialogChange?.(Boolean(element?.open));
    element?.addEventListener("close", changed);
    return () => element?.removeEventListener("close", changed);
  }, [onAccountDialogChange]);
  useEffect(() => subscribeSettingsDialog(target => {
    setMessage("");
    if (target !== "delete") { onShowProfile?.(); return; }
    openDialogWithFocus(deletionDialog.current);
    onAccountDialogChange?.(Boolean(deletionDialog.current?.open));
  }), [onShowProfile, onAccountDialogChange]);
  async function perform(action: () => Promise<unknown>) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setMessage("");
    try { await action(); }
    catch (error) { if (mounted.current) setMessage(error instanceof Error ? error.message : "처리하지 못했어요. 다시 시도해주세요."); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  const ProviderIcon = state.provider === "apple" ? SiApple : state.provider === "google" ? SiGoogle : SiGithub;
  return <>
    <div className="oddk-accountFooter" data-connected={state.connected}>
      {!state.connected && <AppleLoginButton className="oddk-accountLogin" placement="right" disabled={busy || state.deletionPending} onClick={() => void perform(() => loginSync("apple"))} />}
      {state.deletionPending && <button type="button" className="oddk-settingTextButton" onClick={() => openSettingsDialog("delete")}>계정 삭제 결과 확인</button>}
      {state.connected ? <><button type="button" className="oddk-accountButton" aria-label="내 정보 보기" onClick={onShowProfile}><ProviderIcon aria-hidden="true" /><span>{state.displayName || state.name}</span></button><button type="button" className="oddk-syncTrigger" onClick={onShowProfile}><HiOutlineCloud aria-hidden="true" /><span>{syncStatusLabel(state)}</span></button></> : <><button type="button" className="oddk-accountLogin" disabled={busy} onClick={() => void perform(() => loginSync("google"))}><SiGoogle aria-hidden="true" /><span>Google 로그인</span></button><button type="button" className="oddk-accountLogin" disabled={busy} onClick={() => void perform(() => loginSync("github"))}><SiGithub aria-hidden="true" /><span>GitHub 로그인</span></button><small>로그인하면 다른 기기에서도 이어서 사용할 수 있어요.</small>{(message || state.phase === "error") && <small role="status">{message || state.message}</small>}</>}
    </div>
    <AccountDeletionDialog dialogRef={deletionDialog} account={state.name} fallback={fallback} pending={!!state.deletionPending} onDeleted={() => onAccountDialogChange?.(false)} />
  </>;
}
