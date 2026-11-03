"use client";
import { useEffect, useRef, useState } from "react";
import { HiOutlineXMark } from "react-icons/hi2";
import { keepFocusInDialog } from "./dialog-focus";
import { REST_ALERT_MINUTES } from "./rest-alert";
import { formatExecutionClock } from "./execution-timer";

export function RestAlertDialog({ editing, initialMinutes, elapsedMs, totalMs, disabled, error, onApply, onClose }: {
  editing: boolean; initialMinutes: number; elapsedMs: number; totalMs: number; disabled: boolean; error?: string;
  onApply: (minutes: number) => Promise<void>; onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null), [minutes, setMinutes] = useState(initialMinutes);
  useEffect(() => {
    const dialog = ref.current, opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal(); return () => { dialog?.close(); if (opener?.isConnected) opener.focus(); };
  }, []);
  return <dialog ref={ref} className="oddk-dialog oddk-recordDialog oddk-restAlertDialog" aria-labelledby="rest-alert-title" onKeyDown={keepFocusInDialog} onCancel={event => { event.preventDefault(); if (!disabled) onClose(); }}>
    <form className="oddk-dialogForm" onSubmit={event => { event.preventDefault(); if (!disabled) void onApply(minutes); }}>
      <header className="oddk-dialogHeader"><h2 id="rest-alert-title">이번 휴식 알림{editing ? " 변경" : ""}</h2><button type="button" aria-label="휴식 알림 닫기" disabled={disabled} onClick={onClose}><HiOutlineXMark /></button></header>
      <p>이번 휴식에만 적용해요.</p>
      <label className="oddk-dialogField">알림 기준<select autoFocus value={minutes} disabled={disabled} onChange={event => setMinutes(Number(event.target.value))}>{REST_ALERT_MINUTES.map(value => <option value={value} key={value}>{value ? `${value}분` : "알림 없이 쉬기"}</option>)}</select></label>
      <p>{editing ? `이번 휴식 ${formatExecutionClock(elapsedMs)} 경과 · 누적 휴식 ${formatExecutionClock(totalMs)}` : "시작 전에 알림 기준을 확인해주세요."}</p>
      <p>계획의 여유시간과 다른, 이번 휴식의 알림 기준이에요.</p>
      {editing && minutes > 0 && elapsedMs >= minutes * 60000 && <p role="status">이미 기준을 넘겼어요. 변경하면 한 번 알리고 휴식은 계속돼요.</p>}
      {error && <p role="alert" className="oddk-error">{error}</p>}
      <div className="oddk-dialogActions oddk-restAlertActions"><button className="oddk-dialogCancel" type="button" disabled={disabled} onClick={onClose}>취소</button><button className="oddk-primary" type="submit" disabled={disabled}>{editing ? "이 기준으로 변경" : "이 기준으로 휴식 시작"}</button></div>
    </form>
  </dialog>;
}
