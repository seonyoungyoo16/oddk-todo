"use client";
import { useRef, type ReactNode } from "react";
import { HiOutlineXMark } from "react-icons/hi2";
import { useBottomControlSize } from "./use-bottom-control-size";

export function SelectionActions({ count, onClear, children }: { count: number; onClear: () => void; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useBottomControlSize(ref, "--selection-actions-height");
  return <section ref={ref} className="oddk-selectionActions" aria-label="선택한 할 일 작업">
    <div className="oddk-selectionActionsHeader"><strong>{count}개 선택</strong><button type="button" onClick={onClear}>선택 해제<HiOutlineXMark aria-hidden="true" /></button></div>
    <div className="oddk-selectionActionButtons">{children}</div>
  </section>;
}
