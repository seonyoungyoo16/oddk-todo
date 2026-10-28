"use client";
import { useEffect, useRef, useState } from "react";
import { HiOutlineXMark } from "react-icons/hi2";
import type { TimeMovePreview } from "./task-movement";
import { previewTimeMove, shiftStart } from "./task-movement";
import { keepFocusInDialog } from "./dialog-focus";
export function TimeMoveDialog({ initial, onCancel, onApply }: { initial: TimeMovePreview; onCancel: () => void; onApply: (value: TimeMovePreview) => string | null }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [date, setDate] = useState(initial.after.plannedDate!);
  const [time, setTime] = useState(initial.after.startTime!);
  const [error, setError] = useState("");
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  let preview: TimeMovePreview | null = null, validation = "";
  try { preview = previewTimeMove(initial.expected, initial.before.id, date, time); } catch (e) { validation = (e as Error).message; }
  function shift(minutes: number) { try { const next = shiftStart(date, time, minutes); setDate(next.date); setTime(next.time); setError(""); } catch (e) { setError((e as Error).message); } }
  return <dialog ref={ref} className="oddk-dialog" aria-labelledby="time-move-title" onKeyDown={keepFocusInDialog} onCancel={event => { event.preventDefault(); onCancel(); }}>
    <form className="oddk-dialogForm" onSubmit={event => { event.preventDefault(); if (preview) { const message = onApply(preview); if (message) setError(message); } }}>
      <header className="oddk-dialogHeader"><h2 id="time-move-title">시간 이동</h2><button type="button" aria-label="시간 이동 닫기" onClick={onCancel}><HiOutlineXMark aria-hidden="true" /></button></header>
      <strong>{initial.before.title}</strong>
      <p>이전 {initial.before.plannedDate} {initial.before.startTime}~{initial.before.endDate} {initial.before.endTime}</p>
      <div className="oddk-timeMoveFields">
        <label>옮길 날짜<input type="date" min="0001-01-01" max="9999-12-31" required value={date} onChange={event => { setDate(event.target.value); setError(""); }} /></label>
        <label>옮길 시작 시각<input type="time" required value={time} onChange={event => { setTime(event.target.value); setError(""); }} /></label>
        <nav aria-label="시각 이동"><button type="button" onClick={() => shift(-1440)}>하루 전</button><button type="button" onClick={() => shift(-15)}>15분 앞당기기</button><button type="button" onClick={() => shift(15)}>15분 늦추기</button><button type="button" onClick={() => shift(1440)}>하루 뒤</button></nav>
      </div>
      {preview && <><p>변경 {preview.after.plannedDate} {preview.after.startTime}~{preview.after.endDate} {preview.after.endTime}</p><p>작업 {preview.after.minutes! - preview.after.bufferMinutes!}분 + 여유 {preview.after.bufferMinutes}분 = 총 {preview.after.minutes}분 · 소요시간 유지</p>{preview.warnings.length > 0 ? <div role="status"><strong>겹침·활동 시간 확인이 필요해요</strong><ul>{preview.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul><p>다른 일정은 자동으로 옮기지 않아요. 확인 후 반영해주세요.</p></div> : <p>겹치는 일정이 없어요.</p>}</>}
      {(error || validation) && <p role="alert" className="oddk-dialogError">{error || validation}</p>}
      <div className="oddk-dialogActions"><button type="button" onClick={onCancel}>취소</button><button type="submit" className="oddk-primary" disabled={!preview}>확인하고 이동</button></div>
    </form>
  </dialog>;
}
