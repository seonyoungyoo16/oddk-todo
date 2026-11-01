"use client";
import { useEffect, useRef, useState } from "react";
import { HiOutlineTrash, HiOutlineXMark } from "react-icons/hi2";
import { AutoTextarea } from "./auto-textarea";
import { keepFocusInDialog } from "./dialog-focus";
import { parseTaskCandidates } from "./batch-tasks";

export function TaskSplitReview({ source, candidates, onCancel, onAdd }: {
  source: string; candidates: string[]; onCancel: () => void; onAdd: (titles: string[]) => string | null;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [titles, setTitles] = useState(candidates), [error, setError] = useState("");
  useEffect(() => {
    const dialog = dialogRef.current, opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal(); return () => { dialog?.close(); if (opener?.isConnected) opener.focus(); };
  }, []);
  return <dialog ref={dialogRef} className="oddk-dialog oddk-splitReview" aria-labelledby="task-split-title" onKeyDown={keepFocusInDialog} onCancel={event => { event.preventDefault(); onCancel(); }}>
    <form className="oddk-dialogForm" onSubmit={event => {
      event.preventDefault();
      try { setError(onAdd(parseTaskCandidates({ titles })) ?? ""); } catch (error) { setError((error as Error).message); }
    }}>
      <header className="oddk-dialogHeader"><h2 id="task-split-title">나눈 할 일 확인</h2><button type="button" aria-label="나눈 할 일 닫기" onClick={onCancel}><HiOutlineXMark aria-hidden="true" /></button></header>
      <details className="oddk-splitOriginal"><summary>입력한 원문</summary><p>{source}</p></details>
      <ol className="oddk-splitCandidates">{titles.map((title, index) => <li key={index}>
        <label><span className="oddk-srOnly">할 일 {index + 1}</span><AutoTextarea value={title} maxLength={120} onChange={event => { const value = event.target.value; setTitles(current => current.map((title, i) => i === index ? value : title)); setError(""); }} /></label>
        <button type="button" aria-label={`할 일 ${index + 1} 제외`} onClick={() => { setTitles(current => current.filter((_, i) => i !== index)); setError(""); }}><HiOutlineTrash aria-hidden="true" /></button>
      </li>)}</ol>
      {error && <p className="oddk-dialogError" role="alert">{error}</p>}
      <div className="oddk-dialogActions"><button type="button" onClick={onCancel}>취소</button><button type="submit" className="oddk-primary" disabled={!titles.length}>{titles.length}개 추가</button></div>
    </form>
  </dialog>;
}
