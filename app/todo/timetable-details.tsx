"use client";
import { useEffect, useId, useRef } from "react";
import { HiOutlinePencilSquare, HiOutlineXMark } from "react-icons/hi2";
import type { Task } from "../../supabase/functions/_shared/plan";
import { dayLabel } from "./calendar-range";
import { clockLabel } from "./timeline";
import { useBottomControlSize } from "./use-bottom-control-size";

export function TimetableDetails({ task, date, start, end, work, buffer, conflict, onClose, onEdit }: {
  task: Task; date: string; start: number; end: number; work: number; buffer: number;
  conflict: boolean; onClose: () => void; onEdit: () => void;
}) {
  const ref = useRef<HTMLElement>(null), title = useId();
  useBottomControlSize(ref, "--timetable-detail-height");
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
    ref.current?.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, []);
  return <section ref={ref} tabIndex={-1} className="oddk-timetableDetails" aria-labelledby={title} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); onClose(); } }}>
    <header><h3 id={title}>{task.title}</h3><button type="button" aria-label="일정 상세 닫기" onClick={onClose}><HiOutlineXMark aria-hidden="true" /></button></header>
    <p className="oddk-timetableDetailTime">{dayLabel(date)} · {clockLabel(start)}–{clockLabel(end)}</p>
    {conflict && <p className="oddk-timetableDetailWarning" role="status">시간이 겹치는 일정이 있어요.</p>}
    <div className="oddk-timetableDetailFooter"><p>총 {work + buffer}분 = 작업 {work}분 + 여유 {buffer}분</p><button type="button" onClick={onEdit}><HiOutlinePencilSquare aria-hidden="true" />수정</button></div>
  </section>;
}
