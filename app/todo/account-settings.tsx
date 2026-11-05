"use client";

import { useEffect, useRef, useState } from "react";
import { HiOutlineCloud, HiOutlineUserCircle } from "react-icons/hi2";
import { SiGoogle, SiGithub } from "react-icons/si";
import { loginSync, disconnectSync, resolveSyncConflict, exportPlanBackup, syncNow, conflictPreview, getPlanScope } from "./sync-store";
import type { SyncStatus } from "./sync-store";
import { AppleLoginButton } from "./apple-login-button";
import { SettingsCard } from "./settings-card";
import { AccountHelpLinks } from "./account-help-links";
import { AIConsentSettings } from "./ai-consent-controls";
import { DeviceReminderSettings } from "./native-reminder-settings";
import { PushSettings } from "./push-settings";
import { openSettingsDialog } from "./settings-events";

export function syncStatusLabel(state: SyncStatus) {
  return {
    local: "이 기기에 저장 중", syncing: "동기화 중", synced: "동기화됨",
    waiting: "저장 대기", conflict: "충돌 확인 필요", error: "연결 확인 필요",
  }[state.phase];
}

function accountDate(value?: string) {
  if (!value || !Number.isFinite(Date.parse(value))) return "—";
  return new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" });
}

function useAccountActions() {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const inFlight = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function perform(action: () => unknown | Promise<unknown>) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setMessage("");
    try { await action(); }
    catch (error) { if (mounted.current) setMessage(error instanceof Error ? error.message : "처리하지 못했어요. 다시 시도해주세요."); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  return { busy, message, perform };
}

export function AccountSettings({ state, fallback, onShowNotifications }: {
  state: SyncStatus; fallback: string; onShowNotifications: () => void;
}) {
  const { busy, message, perform } = useAccountActions();
  const preview = state.connected && state.phase === "conflict" ? conflictPreview() : null;
  const provider = state.provider === "apple" ? "Apple" : state.provider === "google" ? "Google" : state.provider === "github" ? "GitHub" : state.provider || "—";
  return <>
    <SettingsCard title="계정 정보">
      <div className="oddk-settingActionRow oddk-accountIdentityRow">
        <div className="oddk-settingIdentity"><HiOutlineUserCircle className="oddk-accountIdentityIcon" aria-hidden="true" /><div><strong>{state.connected ? state.displayName || state.name || "—" : "로그인하지 않았어요"}</strong><p>{state.connected ? state.name || "—" : "할 일과 계획은 이 기기에 저장돼요."}</p></div></div>
        {state.connected && <button type="button" className="oddk-settingButton" disabled={busy} onClick={() => void perform(disconnectSync)}>{busy ? "처리 중…" : "로그아웃"}</button>}
      </div>
      {state.connected ? <dl className="oddk-accountFacts">
        <div><dt>로그인 방식</dt><dd>{provider}{provider !== "—" ? " 계정" : ""}</dd></div>
        <div><dt>가입일</dt><dd>{accountDate(state.createdAt)}</dd></div>
        <div><dt>최근 로그인</dt><dd>{accountDate(state.lastSignInAt)}</dd></div>
      </dl> : <><div className="oddk-accountProviders">
        <AppleLoginButton className="oddk-settingButton" disabled={busy || state.deletionPending} onClick={() => void perform(() => loginSync("apple"))} />
        <button type="button" className="oddk-settingButton" disabled={busy} onClick={() => void perform(() => loginSync("google"))}><SiGoogle aria-hidden="true" />Google 로그인</button>
        <button type="button" className="oddk-settingButton" disabled={busy} onClick={() => void perform(() => loginSync("github"))}><SiGithub aria-hidden="true" />GitHub 로그인</button>
      </div><p className="oddk-settingsFootnote">같은 계정으로 로그인하면 다른 기기에서도 이어서 사용할 수 있어요.</p></>}
      {message && <p className="oddk-settingsFeedback" role="status">{message}</p>}
    </SettingsCard>

    <SettingsCard title="이 기기·저장 상태">
      <div className="oddk-settingActionRow oddk-accountSyncRow"><div className="oddk-settingCopy"><strong>할 일 · 목표 · 하루 점검</strong></div><span className="oddk-settingStatus" data-attention={state.phase === "conflict" || state.phase === "error"}><HiOutlineCloud aria-hidden="true" />{syncStatusLabel(state)}</span>
        {state.connected && state.phase !== "conflict" && <button type="button" className="oddk-settingButton" disabled={busy} onClick={() => void perform(syncNow)}>지금 동기화</button>}
      </div>
      {state.refreshRequired && <button type="button" className="oddk-settingTextButton" onClick={() => window.location.reload()}>새로고침하고 다시 연결</button>}
      {state.connected && state.phase === "conflict" && <div className="oddk-syncConflict oddk-accountConflict"><strong>어느 내용을 사용할까요?</strong><p>전체 계획 중 하나를 선택해요. 선택하지 않은 내용은 이 계정의 백업으로 보관해요.</p>
        <details><summary>두 기기 내용 비교</summary><div className="oddk-accountCompare"><section><h3>이 기기</h3><pre>{preview?.local}</pre></section><section><h3>다른 기기</h3><pre>{preview?.cloud}</pre></section></div></details>
        <div className="oddk-syncActions"><button type="button" disabled={busy} onClick={() => void perform(() => resolveSyncConflict("local"))}>이 기기 내용을 저장</button><button type="button" disabled={busy} onClick={() => void perform(() => resolveSyncConflict("cloud"))}>다른 기기 내용을 사용</button><button type="button" disabled={busy} onClick={() => void perform(() => exportPlanBackup(fallback))}>현재 내용 백업</button></div>
      </div>}
      <div className="oddk-settingsCardBottom"><span>기기별 알림과 파일 백업은 환경설정에서 관리해요.</span><button type="button" className="oddk-settingTextButton" onClick={onShowNotifications}>알림·백업</button></div>
    </SettingsCard>

    <SettingsCard title="개인정보·AI 사용">
      <AIConsentSettings />
      <AccountHelpLinks>{(state.connected || state.deletionPending) && <button type="button" className="oddk-deleteAccountLink" onClick={() => openSettingsDialog("delete")}>{state.deletionPending ? "계정 삭제 결과 확인" : "계정 삭제"}</button>}</AccountHelpLinks>
    </SettingsCard>
  </>;
}

export function AccountNotifications({ state }: { state: SyncStatus }) {
  if (state.connected) return <PushSettings key={getPlanScope()} userId={getPlanScope()} />;
  return <DeviceReminderSettings><div className="oddk-settingActionRow"><button type="button" className="oddk-settingButton" onClick={() => openSettingsDialog("sync")}>로그인하고 설정</button></div></DeviceReminderSettings>;
}
