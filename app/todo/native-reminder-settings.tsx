"use client";
import { useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { disableNativeReminders, enableNativeReminders, getNativeReminderSnapshot, getServerReminderSnapshot, subscribeNativeReminders } from "./native-reminders";
import type { NativeReminderStatus } from "./native-reminders";

export function useNativeReminderStatus() {
  const raw = useSyncExternalStore(subscribeNativeReminders, getNativeReminderSnapshot, getServerReminderSnapshot);
  return JSON.parse(raw) as NativeReminderStatus;
}
export function DeviceReminderSettings({ children }: { children: ReactNode }) {
  const state = useNativeReminderStatus();
  const lock = useRef(false);
  const [busy, setBusy] = useState(false), [feedback, setFeedback] = useState("");
  const title = useId(), status = useId(), errorId = useId(), unavailableId = useId();
  if (!state.native) return children;
  const changing = busy || state.phase === "changing";
  const checking = state.phase === "checking";
  const checked = state.available && state.enabled && state.permission === "granted" && state.phase !== "error";
  const error = state.error || (state.phase === "error" ? feedback : "");
  async function toggle() {
    if (lock.current || changing || checking || !state.available) return;
    lock.current = true; setBusy(true); setFeedback("");
    try {
      // A failed OFF retries cleanup; it must not silently turn reminders back on.
      if (checked || state.cleanupPending) await disableNativeReminders();
      else await enableNativeReminders();
    } catch (failure) {
      setFeedback(failure instanceof Error && /[가-힣]/.test(failure.message) ? failure.message : "알림 변경을 완료하지 못했어요. 다시 시도해주세요.");
    } finally { lock.current = false; setBusy(false); }
  }
  return <section className="oddk-deviceReminder" aria-labelledby={title}>
    <div className="oddk-deviceReminderRow">
      <span id={title} className="oddk-deviceReminderLabel">기기 알림</span>
      <div className="oddk-deviceReminderControl">
        <span id={status} role="status" className="oddk-deviceReminderStatus">{!state.available ? "OFF · 미지원" : checking ? "확인 중…" : changing ? "변경 중…" : error ? "확인 필요" : checked ? "ON" : "OFF"}</span>
        {!state.available && <span id={unavailableId} className="oddk-srOnly">이 기기에서는 알림을 지원하지 않아요.</span>}
        <button type="button" role="switch" aria-checked={checked} aria-labelledby={title} aria-describedby={[status, !state.available && unavailableId, error && errorId].filter(Boolean).join(" ")}
          aria-busy={changing || checking} disabled={!state.available || changing || checking} className="oddk-deviceReminderSwitch" onClick={() => void toggle()}>
          <span aria-hidden="true" className="oddk-deviceReminderThumb" />
        </button>
      </div>
    </div>
    {error && <p id={errorId} role="alert" className="oddk-deviceReminderError">{error}</p>}
  </section>;
}
