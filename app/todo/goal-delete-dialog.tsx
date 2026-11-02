"use client";
import { useEffect, useRef, useState } from "react";
import { DialogHeader } from "./ui/dialog-header";
import { keepFocusInDialog } from "./dialog-focus";

export function GoalDeleteDialog({ title, dirty, onCancel, onConfirm }: { title: string; dirty: boolean; onCancel: () => void; onConfirm: () => string | null }) {
  const ref = useRef<HTMLDialogElement>(null), cancel = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const element = ref.current, opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.showModal(); cancel.current?.focus();
    return () => { element?.close(); if (opener?.isConnected && opener.getClientRects().length) opener.focus(); else document.querySelector<HTMLButtonElement>(".oddk-goalAdd")?.focus(); };
  }, []);
  return <dialog ref={ref} className="oddk-dialog oddk-goalDeleteDialog" aria-labelledby="goal-delete-title" onKeyDown={keepFocusInDialog} onCancel={event => { event.preventDefault(); onCancel(); }}>
    <form className="oddk-dialogForm" onSubmit={event => { event.preventDefault(); setError(onConfirm() ?? ""); }}>
      <DialogHeader id="goal-delete-title" title="이 목표를 삭제할까요?" closeLabel="목표 삭제 창 닫기" onClose={onCancel} />
      <div className="oddk-goalDeleteBody"><strong>{title}</strong><p>이 목표와 세부 목표, 할 일 연결을 삭제합니다.</p><p>연결된 할 일은 할 일 목록에 남아 있어요.</p>{dirty && <p>이 목표에 작성 중인 변경 내용도 함께 삭제됩니다.</p>}{error && <p className="oddk-dialogError" role="alert">{error}</p>}</div>
      <div className="oddk-dialogActions"><button ref={cancel} type="button" className="oddk-dialogCancel" onClick={onCancel}>취소</button><button type="submit" className="oddk-primary oddk-danger">목표 삭제</button></div>
    </form>
  </dialog>;
}
