"use client";
import { useRef, useState, type ReactNode } from "react";
import { taskDragType, timetableTaskDragType, timetableDropAtPoint } from "./timetable-drag";

/** The card is the drag target; child actions keep their normal click behavior. */
export function TaskRow({ id, title, className, movable, selected, onDrop, onReceive, onMove, onSelect, onSchedule, children }: {
  id: string; title: string; className: string; movable: boolean; selected?: boolean;
  onDrop: (id: string) => void; onMove: (direction: -1 | 1) => void;
  onReceive: (id: string) => void;
  onSelect?: () => void; onSchedule?: (date: string, time: string) => void; children: ReactNode;
}) {
  const gesture = useRef<{ pointer: number; x: number; y: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [dragging, setDragging] = useState(false);
  function cancel() { gesture.current = null; setDragging(false); }
  return <li data-order-task={id} className={className} data-dragging={dragging}
    tabIndex={0} aria-label={title} data-selected={selected}
    draggable={movable || Boolean(onSchedule)}
    onDragStart={event => { event.dataTransfer.setData(taskDragType, id); if (onSchedule) event.dataTransfer.setData(timetableTaskDragType, id); event.dataTransfer.effectAllowed = "move"; suppressClick.current = true; setDragging(true); }}
    onDragOver={event => { if (movable && event.dataTransfer.types.includes(taskDragType)) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } }}
    onDrop={event => { const source = event.dataTransfer.getData(taskDragType); if (movable && source && source !== id) { event.preventDefault(); onReceive(source); } cancel(); }}
    onDragEnd={cancel}
    title={[onSchedule && "시간표로 드래그해 날짜·시각 배치", movable && "드래그로 순서 변경 · Alt+위/아래 키로도 이동"].filter(Boolean).join(" · ") || undefined}
    onKeyDown={event => {
      if (event.target !== event.currentTarget) return;
      if (event.key === "Escape") { cancel(); return; }
      if (movable && event.altKey && ["ArrowUp", "ArrowDown"].includes(event.key)) {
        event.preventDefault(); onMove(event.key === "ArrowUp" ? -1 : 1);
      } else if (onSelect && [" ", "Enter"].includes(event.key)) { event.preventDefault(); onSelect(); }
    }}
    onClickCapture={event => { if (suppressClick.current) { suppressClick.current = false; event.preventDefault(); event.stopPropagation(); } }}
    onClick={event => { if (onSelect && !(event.target as Element).closest("button,input,a")) onSelect(); }}
    onPointerDown={event => {
      suppressClick.current = false;
      if (event.pointerType === "mouse" || (!movable && !onSchedule) || event.button !== 0 || (event.target as Element).closest("button:not(.oddk-taskContent),input,a")) return;
      gesture.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    }}
    onPointerMove={event => {
      const start = gesture.current;
      if (!start || start.pointer !== event.pointerId) return;
      if (!start.moved && Math.hypot(event.clientX - start.x, event.clientY - start.y) >= 6) {
        start.moved = true; suppressClick.current = true; setDragging(true); event.currentTarget.setPointerCapture(event.pointerId);
      }
    }}
    onPointerUp={event => {
      const start = gesture.current; cancel();
      if (!start?.moved || start.pointer !== event.pointerId) return;
      const placement = onSchedule && timetableDropAtPoint(event.clientX, event.clientY);
      if (placement) { onSchedule!(placement.date, placement.time); return; }
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-order-task]");
      if (movable && target?.dataset.orderTask && target.dataset.orderTask !== id) onDrop(target.dataset.orderTask);
    }} onPointerCancel={cancel} onLostPointerCapture={cancel}>{children}</li>;
}
