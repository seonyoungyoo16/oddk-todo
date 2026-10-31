"use client";
import { useEffect, useRef, useState } from "react";
import { HiOutlineExclamationTriangle } from "react-icons/hi2";
import { DialogHeader } from "./ui/dialog-header";
import type { TimeMovePreview } from "./task-movement";
import { previewTimeMove } from "./task-movement";
import { keepFocusInDialog } from "./dialog-focus";
export function TimeMoveDialog({ initial, stale = false, onCancel, onApply, onRefresh }: { initial: TimeMovePreview; stale?: boolean; onCancel: () => void; onApply: (value: TimeMovePreview) => string | null; onRefresh: (date: string, time: string) => string | null }) {
  const ref = useRef<HTMLDialogElement>(null);
  const date = initial.after.plannedDate!;
  const [time, setTime] = useState(initial.after.startTime!);
  const [error, setError] = useState("");
  useEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    return () => { dialog?.close(); if (opener?.isConnected) opener.focus(); else document.getElementById("todo-input")?.focus(); };
  }, []);
  let preview: TimeMovePreview | null = null, validation = "";
  try { preview = previewTimeMove(initial.expected, initial.before.id, date, time); } catch (e) { validation = (e as Error).message; }
  return <dialog ref={ref} className="oddk-dialog oddk-timeMoveDialog" aria-labelledby="time-move-title" onKeyDown={keepFocusInDialog} onCancel={event => { event.preventDefault(); onCancel(); }}>
    <form className="oddk-dialogForm" onSubmit={event => { event.preventDefault(); if (preview && !stale) { const message = onApply(preview); if (message) setError(message); } }}>
      <DialogHeader id="time-move-title" title="시간 이동" closeLabel="시간 이동 닫기" onClose={onCancel} />
      <div className="oddk-timeMoveTask"><strong>{initial.before.title}</strong><span>{initial.before.plannedDate}{date !== initial.before.plannedDate ? ` → ${date}` : ""}</span></div>
      <div className="oddk-timeMoveBefore"><span>현재 시간</span><span>{initial.before.startTime}–{initial.before.endDayOffset === 1 ? "다음 날 " : ""}{initial.before.endTime}</span></div>
      <div className="oddk-timeMoveFields">
        <label htmlFor="time-move-start">변경할 시작 시각<input id="time-move-start" type="time" required value={time} aria-describedby="time-move-duration" onChange={event => { setTime(event.target.value); setError(""); }} /></label>
        <div className="oddk-timeMoveEnd"><span>종료 시각</span><output aria-label="이동 후 종료 시각" aria-live="polite">{preview ? `${preview.after.endDayOffset === 1 ? "다음 날 " : ""}${preview.after.endTime}` : "—"}</output></div>
      </div>
      <p id="time-move-duration" className="oddk-timeMoveDuration">작업 {initial.before.minutes! - initial.before.bufferMinutes!}분 · 여유 {initial.before.bufferMinutes}분<span>소요시간은 그대로 유지돼요.</span></p>
      {preview && !stale && preview.warnings.length > 0 && <div role="status" className="oddk-timeMoveWarning"><strong><HiOutlineExclamationTriangle aria-hidden="true" />이동 전 확인해주세요</strong><ul>{preview.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></div>}
      {stale && <div role="alert" className="oddk-dialogError"><p>계획이 바뀌었어요. 입력한 시각으로 겹침을 다시 확인해주세요.</p><button type="button" onClick={() => setError(onRefresh(date, time) ?? "")}>최신 계획으로 다시 확인</button></div>}
      {(error || validation) && <p role="alert" className="oddk-dialogError">{error || validation}</p>}
      <div className="oddk-dialogActions"><button type="button" className="oddk-dialogCancel" onClick={onCancel}>취소</button><button type="submit" className="oddk-primary" disabled={!preview || stale}>이동하기</button></div>
    </form>
  </dialog>;
}
