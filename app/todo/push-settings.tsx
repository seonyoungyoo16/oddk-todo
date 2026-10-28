"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { HiOutlineBell, HiOutlineBellSlash } from "react-icons/hi2";
import { disablePush, enablePush, inspectPush, pushDevices, pushSupported, revokePushDevice } from "./push-client";
import type { PushDevice } from "./push-client";
import "./push-settings.css";

export function PushSettings({ userId }: { userId: string }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [devices, setDevices] = useState<PushDevice[]>([]);
  const [installation, setInstallation] = useState<string | null>(null);
  const mounted = useRef(false);
  const refreshSequence = useRef(0);
  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    const support = pushSupported();
    if (mounted.current) setSupported(support);
    const state = await inspectPush(userId);
    if (!mounted.current || sequence !== refreshSequence.current) return;
    setInstallation(state.installationId); setEnabled(state.enabled);
    const list = await pushDevices(userId);
    if (mounted.current && sequence === refreshSequence.current) setDevices(list);
  }, [userId]);
  useEffect(() => {
    mounted.current = true;
    const update = () => { void refresh().catch(() => { if (mounted.current) setFeedback("알림 연결 상태를 확인하지 못했어요. 다시 확인해주세요."); }); };
    update(); window.addEventListener("focus", update); window.addEventListener("online", update);
    return () => { mounted.current = false; window.removeEventListener("focus", update); window.removeEventListener("online", update); };
  }, [refresh]);
  async function perform(work: Promise<unknown>, success: string) {
    setBusy(true); setFeedback("");
    try { await work; if (mounted.current) setFeedback(success); }
    catch (error) { if (mounted.current) setFeedback(error instanceof Error ? error.message : "알림 설정을 변경하지 못했어요."); }
    finally { try { await refresh(); } catch { /* Preserve action feedback and allow explicit retry. */ } if (mounted.current) setBusy(false); }
  }
  return <section className="oddk-pushSettings" aria-labelledby="push-settings-title">
    <div className="oddk-pushHeading"><h3 id="push-settings-title"><HiOutlineBell aria-hidden="true" />일정 알림</h3><span>{enabled === null ? "확인 필요" : enabled ? "이 기기 켜짐" : "이 기기 꺼짐"}</span></div>
    <p>할 일의 알림 시각에 이 기기로 알려드려요. 기기마다 한 번씩 연결해주세요.</p>
    {supported === false && <p>이 브라우저는 푸시 알림을 지원하지 않아요. iPhone·iPad는 홈 화면에 추가한 앱에서 확인해주세요.</p>}
    <div className="oddk-pushActions">
      {supported && <button type="button" disabled={busy} onClick={() => void perform(enabled ? disablePush(userId) : enablePush(userId), enabled ? "이 기기 알림을 껐어요." : "이 기기에 알림을 연결했어요.")}>{enabled ? <HiOutlineBellSlash aria-hidden="true" /> : <HiOutlineBell aria-hidden="true" />}{busy ? "변경 중…" : enabled ? "이 기기 알림 끄기" : "이 기기 알림 켜기"}</button>}
      <button type="button" disabled={busy} onClick={() => void perform(refresh(), "연결 상태를 확인했어요.")}>상태 다시 확인</button>
    </div>
    {feedback && <p role="status">{feedback}</p>}
    <details><summary>연결된 기기 {devices.length}개</summary>{devices.length ? <ul>{devices.map(device => <li key={device.installationId}><div><strong>{device.label}{device.installationId === installation ? " · 현재 기기" : ""}</strong><small>연결 {new Date(device.updatedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "short" })}</small></div><button type="button" disabled={busy} aria-label={`${device.label} 알림 해제`} onClick={() => void perform(revokePushDevice(userId, device, installation), "선택한 기기 알림을 해제했어요.")}>해제</button></li>)}</ul> : <p>연결한 기기가 없어요.</p>}</details>
    <small>로그아웃하면 이 기기의 수신을 차단해요. 브라우저·기기 상태에 따라 알림이 지연되거나 표시되지 않을 수 있어요.</small>
  </section>;
}
