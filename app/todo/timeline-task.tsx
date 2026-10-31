"use client";
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { HiOutlineBars3 } from "react-icons/hi2";
import { timetableDragOffset } from "./weekly-timetable-model";
import { TimelineResizeHandle } from "./timeline-resize-handle";

export function TimelineScroll({ initialMinute, pixelsPerMinute, label, children, initialDay }: {
  initialMinute: number; pixelsPerMinute: number; label: string; children: ReactNode; initialDay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null), initial = useRef(initialMinute);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    let positioned = false;
    const position = () => {
      if (positioned || !element.clientWidth || !element.clientHeight) return;
      element.scrollTop = Math.max(0, initial.current - 30) * pixelsPerMinute;
      if (initialDay !== undefined && element.scrollWidth > element.clientWidth) element.scrollLeft = Math.max(0, (element.scrollWidth - 44) / 7 * initialDay - element.clientWidth / 2 + 44);
      positioned = true;
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(element);
    return () => observer.disconnect();
  }, [pixelsPerMinute, initialDay]);
  return <div ref={ref} className="oddk-timelineScroll" tabIndex={0} role="region" aria-label={label}>{children}</div>;
}

export function TimelineTask({ title, notes, description, start, end, pixelsPerMinute, style, conflict, children, onEdit, onMove, sourceDate, duration, onResize, taskId, highlighted }: {
  notes?: string;
  title: string; description: string; start: number; end: number; pixelsPerMinute: number;
  style: CSSProperties; conflict: boolean; children: ReactNode | ((resizeDelta: number) => ReactNode); onEdit: () => void; onMove: (minutes: number, days?: number) => void; sourceDate?: string;
  duration?: { minutes: number; bufferMinutes: number }; onResize?: (minutes: number) => void;
  taskId?: string; highlighted?: boolean;
}) {
  const [offset, setOffset] = useState({ minutes: 0, days: 0, x: 0, date: "" }), [dragging, setDragging] = useState(false);
  const [resizeDelta, setResizeDelta] = useState<number | null>(null);
  const [memoPosition, setMemoPosition] = useState<CSSProperties | null>(null);
  const memoId = useId(), buttonRef = useRef<HTMLButtonElement>(null);
  function showMemo() {
    if (!notes?.trim() || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect(), width = Math.min(280, window.innerWidth - 24);
    setMemoPosition({ position: "fixed", width, left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)), ...(window.innerHeight - rect.bottom >= 180 ? { top: rect.bottom + 8 } : { bottom: Math.max(12, window.innerHeight - rect.top + 8) }) });
  }
  const gesture = useRef<{ pointer: number; x: number; y: number; latestX: number; latestY: number; scroll: HTMLElement; scrollTop: number; moved: boolean; delta: number; days: number; valid: boolean; move: typeof onMove } | null>(null);
  const frame = useRef<number | null>(null), suppressClick = useRef(false);
  function cancel() {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null; gesture.current = null; setOffset({ minutes: 0, days: 0, x: 0, date: "" }); setDragging(false);
  }
  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current); }, []);
  function update() {
    const current = gesture.current;
    if (!current) return;
    const columns = current.scroll.querySelector<HTMLElement>(".oddk-weekColumns");
    const source = buttonRef.current?.closest<HTMLElement>(".oddk-weekColumn");
    const target = columns ? [...columns.children].find(column => { const rect = column.getBoundingClientRect(); return current.latestX >= rect.left && current.latestX < rect.right; }) as HTMLElement | undefined : undefined;
    const destination = target?.dataset.date ?? sourceDate;
    const delta = timetableDragOffset(start, (current.latestY - current.y + current.scroll.scrollTop - current.scrollTop) / pixelsPerMinute, sourceDate, destination);
    const bounds = current.scroll.getBoundingClientRect(), header = current.scroll.querySelector(".oddk-weekHeader")?.getBoundingClientRect().height ?? 0;
    current.valid = current.latestY >= bounds.top + header && current.latestY < bounds.bottom && current.latestX >= bounds.left + (columns ? 44 : 0) && current.latestX < bounds.right && (!columns || Boolean(target));
    current.delta = delta.minutes; current.days = delta.days;
    setOffset({ ...delta, x: target && source ? target.getBoundingClientRect().left - source.getBoundingClientRect().left : 0, date: destination ?? "" });
  }
  function autoScroll() {
    const current = gesture.current;
    if (!current?.moved) return;
    const rect = current.scroll.getBoundingClientRect(), edge = 32, header = current.scroll.querySelector(".oddk-weekHeader")?.getBoundingClientRect().height ?? 0;
    const direction = current.latestY < rect.top + header + edge ? -1 : current.latestY > rect.bottom - edge ? 1 : 0;
    const horizontal = current.latestX < rect.left + 44 + edge ? -1 : current.latestX > rect.right - edge ? 1 : 0;
    if (direction) current.scroll.scrollTop += direction * 9;
    if (horizontal) current.scroll.scrollLeft += horizontal * 8;
    if (direction || horizontal) update();
    frame.current = requestAnimationFrame(autoScroll);
  }
  const clock = (minute: number) => `${String(Math.floor(minute / 60) % 24).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
  return <div className="oddk-timeSlotGroup" data-planning-task={taskId} data-planning-date={sourceDate} data-planning-highlighted={highlighted || undefined} data-dragging={dragging || resizeDelta !== null} style={{ ...style, ...(resizeDelta !== null ? { height: Math.max(2, (end - start + resizeDelta) * pixelsPerMinute) } : {}), transform: dragging ? `translate(${offset.x}px, ${offset.minutes * pixelsPerMinute}px)` : undefined }}
    onMouseEnter={showMemo} onMouseLeave={event => { if (!event.currentTarget.contains(document.activeElement)) setMemoPosition(null); }}
    onFocus={showMemo} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setMemoPosition(null); }}>
    {dragging && <span className="oddk-dragTime" role="status">{offset.date && `${offset.date.slice(5).replace("-", ".")} `}{clock(start + offset.minutes)}~{end + offset.minutes >= 1440 ? "다음 날 " : ""}{clock(end + offset.minutes)}</span>}
    {resizeDelta !== null && duration && <span className="oddk-dragTime" role="status">종료 {end + resizeDelta >= 1440 ? "다음 날 " : ""}{clock(end + resizeDelta)} · 작업 {duration.minutes + resizeDelta - duration.bufferMinutes}분 + 여유 {duration.bufferMinutes}분 = 총 {duration.minutes + resizeDelta}분</span>}
    <button ref={buttonRef} type="button" className="oddk-timeSlot" data-conflict={conflict} style={{ top: 0, left: 0, width: "100%", height: "100%" }}
      aria-label={description + ", 클릭하여 수정. 드래그 또는 Alt+방향키로 날짜와 시간 이동"} aria-describedby={notes?.trim() ? memoId : undefined} title={notes?.trim() ? undefined : title}
      onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } onEdit(); }}
      onKeyDown={event => {
        if (event.key === "Escape") { event.preventDefault(); cancel(); return; }
        if (event.altKey && ["ArrowUp", "ArrowDown"].includes(event.key)) { event.preventDefault(); onMove(event.key === "ArrowUp" ? -5 : 5); }
        if (sourceDate && event.altKey && ["ArrowLeft", "ArrowRight"].includes(event.key)) { event.preventDefault(); onMove(0, event.key === "ArrowLeft" ? -1 : 1); }
      }}
      onPointerDown={event => {
        if (event.button !== 0) return;
        suppressClick.current = false;
        const scroll = event.currentTarget.closest<HTMLElement>(".oddk-timelineScroll");
        if (!scroll) return;
        gesture.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, latestX: event.clientX, latestY: event.clientY, scroll, scrollTop: scroll.scrollTop, moved: false, delta: 0, days: 0, valid: true, move: onMove };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event => {
        const current = gesture.current;
        if (!current || current.pointer !== event.pointerId) return;
        current.latestX = event.clientX; current.latestY = event.clientY;
        if (!current.moved && Math.hypot(current.latestX - current.x, current.latestY - current.y) >= 6) {
          current.moved = true; suppressClick.current = true; setDragging(true); frame.current = requestAnimationFrame(autoScroll);
        }
        if (current.moved) update();
      }}
      onPointerUp={event => {
        const current = gesture.current;
        if (!current || current.pointer !== event.pointerId) return;
        current.latestX = event.clientX; current.latestY = event.clientY;
        if (current.moved) update();
        const minutes = current.delta, days = current.days, move = current.move, moved = current.moved, valid = current.valid;
        cancel();
        if (moved) { event.preventDefault(); event.stopPropagation(); }
        if (moved && valid && (minutes !== 0 || days !== 0)) move(minutes, days);
      }} onPointerCancel={cancel} onLostPointerCapture={cancel}>
      {typeof children === "function" ? children(resizeDelta ?? 0) : children}<HiOutlineBars3 className="oddk-timelineGrip" aria-hidden="true" />
    </button>
    {duration && onResize && <TimelineResizeHandle title={title} minutes={duration.minutes} bufferMinutes={duration.bufferMinutes} pixelsPerMinute={pixelsPerMinute} delta={resizeDelta} onPreview={setResizeDelta} onCommit={onResize} />}
    {notes?.trim() && <span id={memoId} role="tooltip" className="oddk-slotMemo" style={memoPosition && !dragging && resizeDelta === null ? memoPosition : { display: "none" }}><strong>메모</strong><span>{notes}</span></span>}
  </div>;
}
