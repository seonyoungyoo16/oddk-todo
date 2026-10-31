import { useEffect, useRef, useState } from "react";
import { HiOutlineArrowUp, HiOutlineArrowDown } from "react-icons/hi2";
import { DialogHeader } from "./ui/dialog-header";
import type { Task } from "../../supabase/functions/_shared/plan";
import type { Importance } from "../../supabase/functions/_shared/task-planning";
import { taskImportance, urgencyLabel } from "./task-order";
import { keepFocusInDialog } from "./dialog-focus";
import type { BulkRequest } from "./bulk-actions";
const labels = { high: "높음", normal: "보통", low: "낮음" };
export function TaskImportanceFields({ importance, onChange }: { importance: Importance; onChange: (patch: { importance: Importance }) => void }) {
  return <fieldset className="oddk-editorPriority oddk-editorImportance"><legend>중요도</legend><div className="oddk-priorityOptions">{(["low", "normal", "high"] as const).map(value => <label key={value}><input className="oddk-srOnly" type="radio" name="edit-importance" value={value} checked={importance === value} onChange={() => onChange({ importance: value })} /><span>{labels[value]}</span></label>)}</div></fieldset>;
}
export function TaskPlanningBadges({ task, date, time }: { task: Task; date: string; time: string }) {
  const importance = taskImportance(task), urgency = urgencyLabel(task, date, time);
  return <><span className={`oddk-importanceBadge oddk-${importance}`}>중요도 {labels[importance]}</span>{task.dueDate && <span className="oddk-deadlineBadge">마감 {task.dueDate}{task.dueTime && ` ${task.dueTime}`}{urgency && <strong> · {urgency}</strong>}</span>}</>;
}
export function TaskPlanningFields({ importance, dueDate, dueTime, onChange }: { importance: Importance; dueDate: string; dueTime: string; onChange: (patch: { importance?: Importance; dueDate?: string; dueTime?: string }) => void }) {
  return <fieldset className="oddk-taskPlanning"><legend>중요도와 마감</legend><fieldset className="oddk-editorPriority"><legend>중요도</legend><div className="oddk-priorityOptions">{(["low", "normal", "high"] as const).map(value => <label key={value}><input type="radio" name="edit-importance" value={value} checked={importance === value} onChange={() => onChange({ importance: value })} /><span>{labels[value]}</span></label>)}</div></fieldset><div className="oddk-deadlineFields"><label>마감일<input type="date" min="0001-01-01" max="9999-12-31" value={dueDate} onChange={event => onChange({ dueDate: event.target.value, ...(!event.target.value ? { dueTime: "" } : {}) })} /></label><label>마감 시각 <small>선택</small><input type="time" step={60} disabled={!dueDate} value={dueTime} onChange={event => onChange({ dueTime: event.target.value })} /></label><button type="button" disabled={!dueDate && !dueTime} onClick={() => onChange({ dueDate: "", dueTime: "" })}>마감 해제</button></div><small>마감은 끝내야 할 기한이고, 계획 날짜는 배치할 날이에요. 시각을 비우면 마감일이 끝날 때까지예요. 기존 우선순위는 중요도로 자동 변환하지 않아요.</small></fieldset>;
}
export function TaskMoveButtons({ title, first, last, onMove }: { title: string; first: boolean; last: boolean; onMove: (direction: -1 | 1) => void }) {
  return <span className="oddk-taskMove"><button type="button" disabled={first} aria-label={`${title} 위로 이동`} onClick={() => onMove(-1)}><HiOutlineArrowUp aria-hidden="true" /></button><button type="button" disabled={last} aria-label={`${title} 아래로 이동`} onClick={() => onMove(1)}><HiOutlineArrowDown aria-hidden="true" /></button></span>;
}
export function BulkActionDialog({ request, onCancel, onConfirm }: { request: BulkRequest; onCancel: () => void; onConfirm: () => string | null }) {
  const dialog = useRef<HTMLDialogElement>(null), cancel = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState("");
  useEffect(() => { dialog.current?.showModal(); cancel.current?.focus(); }, []);
  const label = request.kind === "delete" ? "삭제" : request.kind === "done" ? "완료" : "완료 취소";
  return <dialog ref={dialog} className="oddk-dialog oddk-bulkDialog" aria-labelledby="bulk-dialog-title" onKeyDown={keepFocusInDialog} onCancel={event => { event.preventDefault(); onCancel(); }} onClick={event => { if (event.target === event.currentTarget) onCancel(); }}>
    <form className="oddk-dialogForm" onSubmit={event => { event.preventDefault(); const message = onConfirm(); if (message) setError(message); }}>
      <DialogHeader id="bulk-dialog-title" title={`선택한 할 일 ${label}`} closeLabel="일괄 처리 창 닫기" onClose={onCancel} />
      <div className="oddk-bulkBody">
        {request.kind !== "done" && <><p><strong>총 {request.tasks.length}개</strong></p><p>아래 선택한 항목에만 적용해요.</p></>}
        {Boolean(request.excludedSummaries) && <p>요약 업무 {request.excludedSummaries}개는 완료 처리에서 제외해요. 선택한 실행 업무만 변경돼요.</p>}
        <ul className="oddk-bulkTargets">{request.tasks.map(task => <li key={task.id}><strong>{task.title}</strong><span>{task.plannedDate ?? "날짜 없음"} · {task.done ? "완료" : "진행 중"}</span></li>)}</ul>
        {error && <p className="oddk-error" role="alert">{error}</p>}
      </div>
      <div className="oddk-dialogActions"><button ref={cancel} type="button" className="oddk-dialogCancel" onClick={onCancel}>취소</button><button type="submit" className="oddk-primary">{request.tasks.length}개 {label}하기</button></div>
    </form>
  </dialog>;
}
