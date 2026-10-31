"use client";
import { useEffect, useRef, useState } from "react";
import { DialogHeader } from "./ui/dialog-header";
import type { Plan } from "../../supabase/functions/_shared/plan";
import { AutoTextarea } from "./auto-textarea";
import { TaskTimeFields } from "./task-time-fields";
import { keepFocusInDialog } from "./dialog-focus";
import { previewNewTimetableTask } from "./weekly-timetable-model";
import type { TimetableTaskDraft } from "./weekly-timetable-model";

export type NewTimetableTaskPreview = ReturnType<typeof previewNewTimetableTask>;
export function TimetableAddDialog({ plan, date, time, context, onClose, onCreate }: {
  plan: Plan; date: string; time: string; context?: { categoryId: string | null; tagIds: string[] };
  onClose: () => void; onCreate: (preview: NewTimetableTaskPreview) => string | null;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<TimetableTaskDraft>(() => ({ id: crypto.randomUUID(), title: "", notes: "", date, time, work: "25", buffer: "5", categoryId: context?.categoryId ?? null, tagIds: [...(context?.tagIds ?? [])] }));
  const [error, setError] = useState("");
  useEffect(() => {
    const dialog = ref.current, opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    return () => { dialog?.close(); if (opener?.isConnected) opener.focus(); else document.getElementById("todo-input")?.focus(); };
  }, []);
  function change(patch: Partial<TimetableTaskDraft>) { setDraft(current => ({ ...current, ...patch })); setError(""); }
  let preview: NewTimetableTaskPreview | null = null, validation = "";
  if (draft.title.trim()) {
    try { preview = previewNewTimetableTask(plan, draft); } catch (error) { validation = (error as Error).message; }
  }
  return <dialog ref={ref} className="oddk-dialog oddk-placementDialog oddk-timetableAddDialog" aria-labelledby="timetable-add-title" onKeyDown={keepFocusInDialog} onCancel={event => { event.preventDefault(); onClose(); }}>
    <form className="oddk-dialogForm" onSubmit={event => { event.preventDefault(); if (preview) { const problem = onCreate(preview); if (problem) setError(problem); else onClose(); } }}>
      <DialogHeader id="timetable-add-title" title="할 일 추가" closeLabel="추가 창 닫기" onClose={onClose} />
      <div className="oddk-timetableAddBody">
      <label htmlFor="timetable-new-title">할 일<AutoTextarea id="timetable-new-title" aria-label="추가할 할 일" value={draft.title} maxLength={120} required autoFocus placeholder="어떤 일을 할까요?" onChange={event => change({ title: event.target.value })} /></label>
      <label htmlFor="timetable-new-notes">상세 메모 <small>선택</small><AutoTextarea id="timetable-new-notes" aria-label="새 할 일 상세 메모" value={draft.notes} maxLength={2000} placeholder="필요한 내용을 적어주세요." onChange={event => change({ notes: event.target.value })} /></label>
      <div className="oddk-placementFields"><label>날짜<input type="date" required min="0001-01-01" max="9999-12-31" value={draft.date} onChange={event => change({ date: event.target.value })} /></label><label>시작 시각<input type="time" required step={300} value={draft.time} onChange={event => change({ time: event.target.value })} /></label></div>
      <section className="oddk-newTaskDuration" aria-label="새 할 일 소요시간"><h3>소요시간</h3><TaskTimeFields work={draft.work} buffer={draft.buffer} onWorkChange={work => change({ work, ...(!work.trim() ? { buffer: "" } : {}) })} onBufferChange={buffer => change({ buffer })} /></section>
      {preview && <><p className="oddk-placementSummary">{preview.task.startTime}–{preview.task.endDayOffset === 1 ? "다음 날 " : ""}{preview.task.endTime}<small>작업 {preview.task.minutes! - preview.task.bufferMinutes!}분 + 여유 {preview.task.bufferMinutes}분</small></p>{preview.warnings.length > 0 && <div className="oddk-placementWarning" role="status"><strong>추가 전에 확인해주세요</strong><ul>{preview.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></div>}</>}
      {(error || validation) && <p role="alert" className="oddk-dialogError">{error || validation}</p>}
      </div>
      <div className="oddk-dialogActions"><button type="button" onClick={onClose}>취소</button><button type="submit" className="oddk-primary" disabled={!preview}>추가</button></div>
    </form>
  </dialog>;
}
