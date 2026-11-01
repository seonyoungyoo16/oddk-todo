"use client";
import { useId, useState, useSyncExternalStore, type ReactNode } from "react";
import { HiOutlineBell, HiOutlineBellSlash } from "react-icons/hi2";
import { disableNativeReminders, enableNativeReminders, refreshNativeReminders, getNativeReminderSnapshot, getServerReminderSnapshot, subscribeNativeReminders } from "./native-reminders";

export function useNativeReminderStatus() {
  const raw = useSyncExternalStore(subscribeNativeReminders, getNativeReminderSnapshot, getServerReminderSnapshot);
  return JSON.parse(raw) as { native: boolean; available: boolean; enabled: boolean; permission: string; pending: number; deferred: number; error: string };
}
export function DeviceReminderSettings({ children }: { children: ReactNode }) {
  const state = useNativeReminderStatus();
  const [busy, setBusy] = useState(false), [feedback, setFeedback] = useState("");
  const title = useId();
  if (!state.native) return children;
  async function perform(work: () => Promise<void>, success: string) {
    setBusy(true); setFeedback("");
    try { await work(); setFeedback(success); }
    catch (error) { setFeedback(error instanceof Error ? error.message : "알림 상태를 다시 확인해주세요."); }
    finally { setBusy(false); }
  }
  return <section className="oddk-pushSettings" aria-labelledby={title}>
    <div className="oddk-pushHeading"><h3 id={title}><HiOutlineBell aria-hidden="true" />이 iPhone의 일정 알림</h3><span>{state.enabled ? "켜짐" : "꺼짐"}</span></div>
    <p>로그인 없이 사용할 수 있어요. 할 일 수정창의 ‘반복·알림 → 시작 알림’에서 알릴 시각을 선택하세요.</p>
    <p>앱을 닫아도 iPhone이 알려드려요. 시간 수정·완료·삭제는 이 기기에 저장되는 즉시 예약에 반영돼요.</p>
    {!state.available ? <p>알림 기능이 포함된 최신 iPhone 앱을 한 번 설치해주세요. 이후 화면 업데이트는 기존 자동 업데이트를 사용할 수 있어요.</p> : <>
      <div className="oddk-pushActions">
        <button type="button" disabled={busy} onClick={() => void perform(state.enabled ? disableNativeReminders : enableNativeReminders, state.enabled ? "이 기기 알림을 껐어요." : "이 기기 일정 알림을 켰어요.")}>{state.enabled ? <HiOutlineBellSlash aria-hidden="true" /> : <HiOutlineBell aria-hidden="true" />}{busy ? "변경 중…" : state.enabled ? "이 기기 알림 끄기" : "이 기기 알림 켜기"}</button>
        <button type="button" disabled={busy} onClick={() => void perform(refreshNativeReminders, "알림 상태를 다시 확인했어요.")}>상태 다시 확인</button>
        {state.error && <button type="button" disabled={busy} onClick={() => void perform(disableNativeReminders, "알림 설정을 초기화했어요. 다시 켤 수 있어요.")}>알림 끄고 초기화</button>}
      </div>
      {state.permission === "denied" && <p>iPhone 설정 → 알림 → oddk에서 알림을 허용해주세요.</p>}
      {state.enabled && <p role="status">예약된 알림 {state.pending}개{state.deferred > 0 ? ` · 대기 ${state.deferred}개. iPhone 예약 한도 때문에 가까운 일정부터 예약하고 앱을 열 때 보충해요.` : ""}</p>}
    </>}
    {state.error && <p role="alert">{state.error}</p>}
    {feedback && <p role="status">{feedback}</p>}
    <small>한국 시간 기준이에요. 계정을 바꾸면 알림을 다시 켜주세요. 다른 기기에서 바꾼 내용은 이 앱이 동기화한 뒤 반영돼요. 집중 모드·무음·알림 요약 설정은 iPhone 설정을 따라요.</small>
  </section>;
}
