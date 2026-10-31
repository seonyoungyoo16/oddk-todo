"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { HiOutlineCloud, HiOutlineXMark, HiOutlineArrowPath, HiOutlineEnvelope, HiOutlineArrowRightOnRectangle } from "react-icons/hi2";
import { SiGoogle, SiGithub } from "react-icons/si";
import { loginSync, disconnectSync, resolveSyncConflict, exportPlanBackup, syncNow, startSync, getSyncSnapshot, getServerSyncSnapshot, subscribeSync, conflictPreview } from "./sync-store";
import type { SyncStatus } from "./sync-store";
import { keepFocusInDialog } from "./dialog-focus";
import { PushSettings } from "./push-settings";
import { getPlanScope } from "./sync-store";

export function SyncPanel({ fallback }: { fallback: string }) {
  const raw = useSyncExternalStore(subscribeSync, getSyncSnapshot, getServerSyncSnapshot);
  const state: SyncStatus = JSON.parse(raw);
  const dialog = useRef<HTMLDialogElement>(null);
  const profileDialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => startSync(fallback), [fallback]);
  async function perform(action: () => Promise<unknown>) {
    setBusy(true); setMessage("");
    try { await action(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "처리하지 못했어요. 다시 시도해주세요."); }
    finally { setBusy(false); }
  }
  const preview = state.phase === "conflict" ? conflictPreview() : null;
  const ProviderIcon = state.provider === "google" ? SiGoogle : SiGithub;
  const providerName = state.provider === "google" ? "Google" : state.provider === "github" ? "GitHub" : state.provider ?? "계정";
  const date = (value?: string) => value ? new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" }) : "—";
  return <>
    <div className="oddk-accountFooter" data-connected={state.connected}>
      {state.connected ? <><button type="button" className="oddk-accountButton" aria-label="내 정보 보기" onClick={() => { setMessage(""); profileDialog.current?.showModal(); }}><ProviderIcon aria-hidden="true" /><span>{state.displayName || state.name}</span></button><button type="button" className="oddk-syncTrigger" onClick={() => { setMessage(""); dialog.current?.showModal(); }}><HiOutlineCloud aria-hidden="true" /><span>{state.phase === "synced" ? "동기화됨" : state.phase === "conflict" ? "충돌 확인" : state.phase === "waiting" ? "저장 대기" : state.phase === "error" ? "연결 확인" : "동기화 중"}</span></button></> : <><button type="button" className="oddk-accountLogin" disabled={busy} onClick={() => void perform(() => loginSync("google"))}><SiGoogle aria-hidden="true" /><span>Google 로그인</span></button><button type="button" className="oddk-accountLogin" disabled={busy} onClick={() => void perform(() => loginSync("github"))}><SiGithub aria-hidden="true" /><span>GitHub 로그인</span></button><small>로그인하면 다른 기기에서도 이어서 사용할 수 있어요.</small>{(message || state.phase === "error") && <small role="status">{message || state.message}</small>}</>}
    </div>
    <dialog ref={profileDialog} className="oddk-dialog oddk-profileDialog" aria-labelledby="profile-title" onKeyDown={keepFocusInDialog} onClick={(event) => { if (event.target === event.currentTarget) profileDialog.current?.close(); }}>
      <div className="oddk-dialogForm">
        <header className="oddk-dialogHeader"><h2 id="profile-title">내 정보</h2><button type="button" aria-label="내 정보 닫기" onClick={() => profileDialog.current?.close()}><HiOutlineXMark /></button></header>
        <div className="oddk-profileIdentity"><span className="oddk-providerMark"><ProviderIcon aria-hidden="true" /></span><strong>{state.displayName || state.name}</strong><span className="oddk-providerBadge">{providerName} 계정으로 로그인</span></div>
        <dl className="oddk-profileDetails"><div className="oddk-profileEmail"><dt><HiOutlineEnvelope aria-hidden="true" />이메일</dt><dd>{state.name}</dd></div><div><dt>가입일</dt><dd>{date(state.createdAt)}</dd></div><div><dt>최근 로그인</dt><dd>{date(state.lastSignInAt)}</dd></div></dl>
        {state.connected && <PushSettings key={getPlanScope()} userId={getPlanScope()} />}
        {message && <p className="oddk-syncFeedback" role="status">{message}</p>}
        <div className="oddk-profileFooter"><button type="button" className="oddk-logoutButton" disabled={busy} onClick={() => void perform(async () => { await disconnectSync(); profileDialog.current?.close(); })}><HiOutlineArrowRightOnRectangle aria-hidden="true" />{busy ? "로그아웃 중…" : "로그아웃"}</button><small>이 기기에서만 로그아웃돼요.</small></div>
      </div>
    </dialog>
    <dialog ref={dialog} className="oddk-dialog oddk-syncDialog" aria-labelledby="sync-title" onKeyDown={keepFocusInDialog} onClick={(event) => { if (event.target === event.currentTarget && !busy) dialog.current?.close(); }}>
      <div className="oddk-dialogForm"><header className="oddk-dialogHeader"><h2 id="sync-title">기기 동기화</h2><button type="button" aria-label="동기화 창 닫기" onClick={() => dialog.current?.close()}><HiOutlineXMark /></button></header>
        <p className="oddk-syncStatus" role="status">{state.message}</p>
        {state.refreshRequired && <button type="button" className="oddk-syncLogin" onClick={() => window.location.reload()}>새로고침하고 다시 연결</button>}
        {!state.connected ? <>
          <p className="oddk-syncHelp">다른 기기에서도 같은 계정으로 로그인하면 할 일·만다라트·하루 점검을 함께 볼 수 있어요.</p>
          <button className="oddk-syncLogin" type="button" disabled={busy} onClick={() => void perform(() => loginSync("google"))}><SiGoogle aria-hidden="true" />Google 로그인</button>
          <button className="oddk-syncLogin" type="button" disabled={busy} onClick={() => void perform(() => loginSync("github"))}><SiGithub aria-hidden="true" />GitHub 로그인</button>
          <p className="oddk-syncHelp">첫 로그인에는 이 기기의 저장된 내용을 동기화해요. 계정에 기존 데이터가 있으면 그 내용을 불러오고, 이 기기 내용은 백업해요.</p>
        </> : <>
          <p className="oddk-syncHelp">{state.name}<br />변경한 내용은 자동 저장하며, 다른 기기의 변경은 약 5초마다 확인해요.</p>
          {state.phase === "conflict" && <div className="oddk-syncConflict"><strong>어느 내용을 저장할까요?</strong><p>날짜가 달라도 전체 계획 중 하나를 선택해요. 선택하지 않은 내용은 이 계정의 백업으로 보관해요.</p><details><summary>두 기기 내용 비교</summary><h3>이 기기</h3><pre>{preview?.local}</pre><h3>다른 기기</h3><pre>{preview?.cloud}</pre></details><button type="button" disabled={busy} onClick={() => void perform(() => resolveSyncConflict("local"))}>이 기기 내용을 저장</button><button type="button" disabled={busy} onClick={() => void perform(() => resolveSyncConflict("cloud"))}>다른 기기 내용을 사용</button></div>}
          <div className="oddk-syncActions"><button type="button" disabled={busy} onClick={() => void perform(syncNow)}><HiOutlineArrowPath aria-hidden="true" />지금 동기화</button><button type="button" disabled={busy} onClick={() => void perform(disconnectSync)}>이 기기에서 로그아웃</button></div>
          <p className="oddk-syncHelp">로그아웃하면 로그인 전 이 기기의 목록으로 돌아가요. 계정 데이터는 서버에 남아 있어요.</p>
        </>}
        <div className="oddk-syncActions"><button type="button" onClick={() => { try { exportPlanBackup(fallback); } catch (error) { setMessage((error as Error).message); } }}>현재 내용 백업</button><button type="button" onClick={() => { try { exportPlanBackup(fallback, true); } catch (error) { setMessage((error as Error).message); } }}>최근 보관 백업 받기</button></div>
        {message && <p className="oddk-syncFeedback" role="status">{message}</p>}
      </div>
    </dialog>
  </>;
}
