"use client";
import { useRef, useState } from "react";
import { HiOutlineBars3 } from "react-icons/hi2";

export function TaskDragHandle({ title, disabled = false, onDrop, onShift, pixelsPerMinute = 3 }: {
  title: string; disabled?: boolean; onDrop?: (id: string) => void; onShift?: (minutes: number) => void; pixelsPerMinute?: number;
}) {
  const [dragging, setDragging] = useState(false);
  const gesture = useRef<{ pointer: number; y: number; drop?: typeof onDrop; shift?: typeof onShift } | null>(null);
  function cancel() { gesture.current = null; setDragging(false); }
  return <button type="button" className="oddk-dragHandle" data-dragging={dragging} disabled={disabled}
    aria-label={title + (onShift ? " 시간 드래그. 시각 입력은 옆의 시간 이동 버튼을 사용하세요." : " 순서 드래그. 키보드는 위·아래 버튼을 사용하세요.")}
    onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); cancel(); } }}
    onPointerDown={event => {
      if (event.button !== 0 || disabled) return;
      gesture.current = { pointer: event.pointerId, y: event.clientY, drop: onDrop, shift: onShift };
      event.currentTarget.setPointerCapture(event.pointerId); setDragging(true);
    }}
    onPointerCancel={cancel} onLostPointerCapture={cancel}
    onPointerUp={event => {
      const started = gesture.current; cancel();
      if (!started || started.pointer !== event.pointerId) return;
      const delta = event.clientY - started.y;
      if (Math.abs(delta) < 6) return;
      if (started.shift) started.shift(Math.round(delta / pixelsPerMinute / 5) * 5);
      else {
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-order-task]");
        if (target?.dataset.orderTask) started.drop?.(target.dataset.orderTask);
      }
    }}><HiOutlineBars3 aria-hidden="true" /></button>;
}
