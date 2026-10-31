"use client";
import { useEffect, useRef, useState } from "react";
import { DialogHeader } from "./ui/dialog-header";
import type { TaskDurationPreview } from "./task-duration";
import { keepFocusInDialog } from "./dialog-focus";

export function TaskDurationDialog({ preview, stale, onCancel, onApply, onRefresh }: {
  preview: TaskDurationPreview; stale: boolean; onCancel: () => void;
  onApply: (preview: TaskDurationPreview) => string | null; onRefresh: () => string | null;
}) {
  const ref = useRef<HTMLDialogElement>(null), [error, setError] = useState("");
  useEffect(() => {
    const dialog = ref.current, opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    return () => { dialog?.close(); if (opener?.isConnected) opener.focus(); else document.getElementById("todo-input")?.focus(); };
  }, []);
  return <dialog ref={ref} className="oddk-dialog" aria-labelledby="duration-change-title" onKeyDown={keepFocusInDialog} onCancel={event => { event.preventDefault(); onCancel(); }}>
    <form className="oddk-dialogForm" onSubmit={event => { event.preventDefault(); if (!stale) setError(onApply(preview) ?? ""); }}>
      <DialogHeader id="duration-change-title" title="소요시간 변경" closeLabel="소요시간 변경 닫기" onClose={onCancel} />
      <strong>{preview.before.title}</strong>
      <p>이전 {preview.before.startTime}–{preview.before.endDayOffset ? "다음 날 " : ""}{preview.before.endTime} · 총 {preview.before.minutes}분</p>
      <p>변경 {preview.after.startTime}–{preview.after.endDayOffset ? "다음 날 " : ""}{preview.after.endTime}</p>
      <p>작업 {preview.after.minutes! - preview.after.bufferMinutes!}분 + 여유 {preview.after.bufferMinutes}분 = 총 {preview.after.minutes}분</p>
      {stale ? <div role="alert" className="oddk-dialogError"><p>계획이 바뀌었어요. 최신 계획으로 겹침을 다시 확인해주세요.</p><button type="button" onClick={() => setError(onRefresh() ?? "")}>최신 계획으로 다시 확인</button></div> : preview.warnings.length > 0 && <div role="status"><strong>겹침·활동 시간 확인이 필요해요</strong><ul>{preview.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></div>}
      {error && <p role="alert" className="oddk-dialogError">{error}</p>}
      <div className="oddk-dialogActions"><button type="button" onClick={onCancel}>취소</button><button type="submit" className="oddk-primary" disabled={stale}>확인하고 변경</button></div>
    </form>
  </dialog>;
}
