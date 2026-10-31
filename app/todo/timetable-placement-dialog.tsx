"use client";
import { useEffect, useRef, useState } from "react";
import { hasTaskTime } from "../../supabase/functions/_shared/plan";
import { DialogHeader } from "./ui/dialog-header";
import { TaskTimeFields } from "./task-time-fields";
import { parseTaskTimeDraft } from "./task-time";
import { keepFocusInDialog } from "./dialog-focus";
import { previewTimetablePlacement } from "./weekly-timetable-model";
import type { TimetablePlacementDuration, TimetablePlacementPreview } from "./weekly-timetable-model";

export function TimetablePlacementDialog({ initial, stale, onCancel, onApply, onRefresh }: {
  initial: TimetablePlacementPreview; stale: boolean; onCancel: () => void;
  onApply: (preview: TimetablePlacementPreview) => string | null;
  onRefresh: (date: string, time: string, duration?: TimetablePlacementDuration) => string | null;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [date, setDate] = useState(initial.after.plannedDate!);
  const [time, setTime] = useState(initial.after.startTime!);
  const [work, setWork] = useState(String(initial.after.minutes! - initial.after.bufferMinutes!));
  const [buffer, setBuffer] = useState(String(initial.after.bufferMinutes!));
  const [error, setError] = useState("");
  const needsDuration = !hasTaskTime(initial.before);
  useEffect(() => {
    const dialog = ref.current, opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    return () => { dialog?.close(); if (opener?.isConnected) opener.focus(); else document.getElementById("todo-input")?.focus(); };
  }, []);
  let preview: TimetablePlacementPreview | null = null, validation = "", duration: TimetablePlacementDuration | undefined;
  try {
    if (needsDuration) {
      const parsed = parseTaskTimeDraft(work, buffer);
      if (parsed.error || parsed.minutes === null || parsed.bufferMinutes === null) throw new Error(parsed.error || "작업 시간과 여유 시간을 입력해주세요.");
      duration = { minutes: parsed.minutes, bufferMinutes: parsed.bufferMinutes };
    }
    preview = previewTimetablePlacement(initial.expected, initial.before.id, date, time, duration);
  } catch (error) { validation = (error as Error).message; }
  return <dialog ref={ref} className="oddk-dialog oddk-placementDialog" aria-labelledby="timetable-place-title" onKeyDown={keepFocusInDialog} onCancel={event => { event.preventDefault(); onCancel(); }}>
    <form className="oddk-dialogForm" onSubmit={event => { event.preventDefault(); if (preview && !stale) setError(onApply(preview) ?? ""); }}>
      <DialogHeader id="timetable-place-title" title="시간표에 배치" closeLabel="배치 창 닫기" onClose={onCancel} />
      <strong className="oddk-placementTitle">{initial.before.title}</strong>
      <div className="oddk-placementFields"><label>날짜<input type="date" required min="0001-01-01" max="9999-12-31" value={date} onChange={event => { setDate(event.target.value); setError(""); }} /></label><label>시작 시각<input type="time" required step={300} value={time} onChange={event => { setTime(event.target.value); setError(""); }} /></label></div>
      {needsDuration && <section className="oddk-newTaskDuration" aria-label="배치할 할 일 소요시간"><h3>작업·여유 시간</h3><TaskTimeFields work={work} buffer={buffer} onWorkChange={value => { setWork(value); setError(""); }} onBufferChange={value => { setBuffer(value); setError(""); }} /></section>}
      {preview && <p className="oddk-placementSummary">{preview.after.startTime}–{preview.after.endDayOffset === 1 ? "다음 날 " : ""}{preview.after.endTime}<small>작업 {preview.after.minutes! - preview.after.bufferMinutes!}분 + 여유 {preview.after.bufferMinutes}분 = 총 {preview.after.minutes}분</small></p>}
      {!needsDuration && <p className="oddk-placementNote">설정한 소요시간은 그대로 유지돼요.</p>}
      {preview && !stale && preview.warnings.length > 0 && <div className="oddk-placementWarning" role="status"><strong>배치 전에 확인해주세요</strong><ul>{preview.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></div>}
      {stale && <div className="oddk-dialogError" role="alert"><p>계획이 바뀌었어요. 입력한 날짜와 시각으로 다시 확인해주세요.</p><button type="button" disabled={!preview} onClick={() => setError(onRefresh(date, time, duration) ?? "")}>최신 계획으로 다시 확인</button></div>}
      {(error || validation) && <p className="oddk-dialogError" role="alert">{error || validation}</p>}
      <div className="oddk-dialogActions"><button type="button" className="oddk-dialogCancel" onClick={onCancel}>취소</button><button type="submit" className="oddk-primary" disabled={!preview || stale}>배치하기</button></div>
    </form>
  </dialog>;
}
