"use client";
import { useEffect, useRef, type PointerEvent } from "react";
import { durationAfterDrag } from "./task-duration";

export function TimelineResizeHandle({ title, minutes, bufferMinutes, pixelsPerMinute, delta, onPreview, onCommit }: {
  title: string; minutes: number; bufferMinutes: number; pixelsPerMinute: number; delta: number | null;
  onPreview: (delta: number | null) => void; onCommit: (minutes: number) => void;
}) {
  const gesture = useRef<{ pointer: number; y: number; latestY: number; latestX: number; scroll: HTMLElement; column: HTMLElement; scrollTop: number; moved: boolean; minutes: number; valid: boolean; commit: typeof onCommit } | null>(null);
  const frame = useRef<number | null>(null);
  function cancel() {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null; gesture.current = null; onPreview(null);
  }
  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current); }, []);
  function update() {
    const current = gesture.current;
    if (!current) return;
    const bounds = current.scroll.getBoundingClientRect(), column = current.column.getBoundingClientRect();
    const header = current.scroll.querySelector(".oddk-weekHeader")?.getBoundingClientRect().height ?? 0;
    current.valid = current.latestY >= bounds.top + header && current.latestY < bounds.bottom && current.latestX >= Math.max(column.left, bounds.left + 44) && current.latestX < Math.min(column.right, bounds.right);
    current.minutes = durationAfterDrag(minutes, bufferMinutes, (current.latestY - current.y + current.scroll.scrollTop - current.scrollTop) / pixelsPerMinute);
    onPreview(current.minutes - minutes);
  }
  function autoScroll() {
    const current = gesture.current;
    if (!current?.moved) return;
    const bounds = current.scroll.getBoundingClientRect(), header = current.scroll.querySelector(".oddk-weekHeader")?.getBoundingClientRect().height ?? 0;
    const direction = current.latestY < bounds.top + header + 24 ? -1 : current.latestY > bounds.bottom - 24 ? 1 : 0;
    if (direction) { current.scroll.scrollTop += direction * 6; update(); }
    frame.current = requestAnimationFrame(autoScroll);
  }
  function track(event: PointerEvent<HTMLButtonElement>) {
    const current = gesture.current;
    if (!current || current.pointer !== event.pointerId) return;
    current.latestX = event.clientX; current.latestY = event.clientY;
    if (!current.moved && Math.abs(current.latestY - current.y) >= 3) { current.moved = true; frame.current = requestAnimationFrame(autoScroll); }
    if (current.moved) update();
  }
  return <button type="button" role="slider" aria-label={`${title} 소요시간 조절`} aria-orientation="vertical" aria-valuemin={bufferMinutes + 1} aria-valuemax={240} aria-valuenow={minutes + (delta ?? 0)} aria-valuetext={`총 ${minutes + (delta ?? 0)}분, 여유 ${bufferMinutes}분 유지`} className="oddk-resizeHandle" title="아래쪽을 드래그하거나 위·아래 방향키로 소요시간 조절"
    onClick={event => { event.preventDefault(); event.stopPropagation(); }}
    onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancel(); return; }
      if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      const next = event.key === "Home" ? bufferMinutes + 1 : event.key === "End" ? 240 : durationAfterDrag(minutes, bufferMinutes, event.key === "ArrowUp" ? -5 : 5);
      if (next !== minutes) onCommit(next);
    }}
    onPointerDown={event => {
      if (event.button !== 0) return;
      event.stopPropagation();
      const scroll = event.currentTarget.closest<HTMLElement>(".oddk-timelineScroll"), column = event.currentTarget.closest<HTMLElement>(".oddk-weekColumn");
      if (!scroll || !column) return;
      gesture.current = { pointer: event.pointerId, y: event.clientY, latestY: event.clientY, latestX: event.clientX, scroll, column, scrollTop: scroll.scrollTop, moved: false, minutes, valid: true, commit: onCommit };
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={track}
    onPointerUp={event => {
      track(event);
      const current = gesture.current;
      if (!current || current.pointer !== event.pointerId) return;
      event.preventDefault(); event.stopPropagation();
      const { moved, valid, minutes: next, commit } = current;
      cancel();
      if (moved && valid && next !== minutes) commit(next);
    }} onPointerCancel={cancel} onLostPointerCapture={cancel}><span aria-hidden="true" /></button>;
}
