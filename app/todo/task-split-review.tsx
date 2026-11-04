"use client";
import { useEffect, useRef, useState } from "react";
import { HiOutlineArrowPath, HiOutlineTrash, HiOutlineXMark } from "react-icons/hi2";
import { AutoTextarea } from "./auto-textarea";
import { keepFocusInDialog, openDialogWithFocus, restoreDialogFocus } from "./dialog-focus";
import { parseTaskCandidates } from "./batch-tasks";

/** A second tap after the modal disappears must not activate the navigation below it. */
export function protectTaskSplitReturn(doc: Document) {
  const view = doc.defaultView;
  if (!view?.setTimeout) return;
  const types = ["pointerdown", "pointerup", "click", "dblclick"];
  const block = (event: Event) => {
    if (event.type === "click" && (event as MouseEvent).detail === 0) return;
    if ((event.target as Element | null)?.closest?.("dialog[open]")) return;
    event.preventDefault(); event.stopImmediatePropagation();
  };
  for (const type of types) doc.addEventListener(type, block, true);
  view.setTimeout(() => { for (const type of types) doc.removeEventListener(type, block, true); }, 350);
}

/** Keep the underlying page and its independent source/list scroll positions unchanged. */
export function openTaskSplitDialog(dialog: HTMLDialogElement, opener: HTMLElement | null) {
  const doc = dialog.ownerDocument, view = doc.defaultView;
  const body = doc.body.style, root = doc.documentElement.style;
  const before = { overflow: body.overflow, position: body.position, top: body.top, left: body.left, right: body.right, width: body.width, rootOverflow: root.overflow };
  const x = view?.scrollX ?? 0, y = view?.scrollY ?? 0;
  const scrolls = [...doc.querySelectorAll<HTMLElement>(".oddk-taskListScroll,.oddk-composer textarea")].map(element => ({ element, top: element.scrollTop, left: element.scrollLeft }));
  openDialogWithFocus(dialog);
  body.overflow = "hidden"; body.position = "fixed"; body.top = `-${y}px`; body.left = `-${x}px`; body.right = "0"; body.width = "100%"; root.overflow = "hidden";
  dialog.querySelector<HTMLButtonElement>("[data-split-close]")?.focus({ preventScroll: true });
  let closed = false;
  return () => {
    if (closed) return; closed = true;
    if (dialog.open) dialog.close();
    body.overflow = before.overflow; body.position = before.position; body.top = before.top; body.left = before.left; body.right = before.right; body.width = before.width; root.overflow = before.rootOverflow;
    for (const { element, top, left } of scrolls) if (element.isConnected) { element.scrollTop = top; element.scrollLeft = left; }
    view?.scrollTo({ left: x, top: y, behavior: "instant" });
    protectTaskSplitReturn(doc);
    restoreDialogFocus(opener);
  };
}

export function TaskSplitReview({ source, candidates, phase = "result", message = "", opener = null, onRetry, onCancel, onAdd }: {
  source: string; candidates: string[]; phase?: "busy" | "result" | "error"; message?: string; opener?: HTMLElement | null;
  onRetry?: () => void; onCancel: () => void; onAdd: (titles: string[]) => string | null;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog) return openTaskSplitDialog(dialog, opener);
  }, [opener]);
  return <dialog ref={dialogRef} className="oddk-dialog oddk-splitReview" aria-labelledby="task-split-title" onKeyDown={keepFocusInDialog} onCancel={event => { event.preventDefault(); onCancel(); }}>
    <div className="oddk-dialogForm oddk-splitFrame">
      <header className="oddk-dialogHeader oddk-splitHeader"><h2 id="task-split-title">AI로 할 일 나누기</h2><button type="button" data-split-close="true" aria-label="나눈 할 일 닫기" onClick={onCancel}><HiOutlineXMark aria-hidden="true" /></button></header>
      {phase === "result" ? <TaskSplitResult source={source} candidates={candidates} onCancel={onCancel} onAdd={onAdd} /> : <>
        <div className="oddk-splitBody">
          <details className="oddk-splitOriginal"><summary>입력한 원문</summary><p>{source}</p></details>
          {phase === "busy" ? <section className="oddk-splitPhase" role="status" aria-live="polite">
          <span className="oddk-splitBusySymbol"><HiOutlineArrowPath aria-hidden="true" /></span><h3>할 일을 나누고 있어요</h3><p>원문은 그대로 유지돼요.</p>
          </section> : <section className="oddk-splitPhase" role="alert"><h3>분석을 마치지 못했어요</h3><p>{message || "잠시 후 다시 시도해주세요. 입력한 문장은 그대로 남아 있어요."}</p></section>}
        </div>
        <div className="oddk-dialogActions oddk-splitFooter"><button type="button" className="oddk-dialogCancel" onClick={onCancel}>{phase === "busy" ? "중단하고 돌아가기" : "원문으로 돌아가기"}</button>{phase === "error" ? <button type="button" className="oddk-primary" onClick={onRetry} disabled={!onRetry}>다시 분석</button> : <button type="button" className="oddk-primary" disabled>분석 중</button>}</div>
      </>}
    </div>
  </dialog>;
}

function TaskSplitResult({ source, candidates, onCancel, onAdd }: { source: string; candidates: string[]; onCancel: () => void; onAdd: (titles: string[]) => string | null }) {
  const submitting = useRef(false);
  const [titles, setTitles] = useState(candidates), [error, setError] = useState("");
  return <>
    <div className="oddk-splitBody">
      <details className="oddk-splitOriginal"><summary>입력한 원문</summary><p>{source}</p></details>
      <div className="oddk-splitResultHeading" role="status" aria-live="polite"><h3>나눈 할 일을 확인해 주세요</h3><p>제목을 고치거나 필요 없는 항목을 뺄 수 있어요.</p></div>
      <form id="task-split-confirm" onSubmit={event => {
        event.preventDefault();
        if (submitting.current) return;
        submitting.current = true;
        try { const message = onAdd(parseTaskCandidates({ titles })); setError(message ?? ""); if (message) submitting.current = false; }
        catch (error) { submitting.current = false; setError((error as Error).message); }
      }}>
        <ol className="oddk-splitCandidates">{titles.map((title, index) => <li key={index}>
            <span className="oddk-splitNumber" aria-hidden="true">{index + 1}</span>
            <label><span className="oddk-srOnly">할 일 {index + 1}</span><AutoTextarea value={title} maxLength={120} onChange={event => { const value = event.target.value; setTitles(current => current.map((title, i) => i === index ? value : title)); setError(""); }} /></label>
            <button type="button" aria-label={`할 일 ${index + 1} 제외`} onClick={() => { setTitles(current => current.filter((_, i) => i !== index)); setError(""); }}><HiOutlineTrash aria-hidden="true" /></button>
        </li>)}</ol>
        {!titles.length && <p className="oddk-splitEmpty">추가할 할 일이 없어요. 원문으로 돌아가 다시 적어주세요.</p>}
        {error && <p className="oddk-dialogError" role="alert">{error}</p>}
      </form>
    </div>
    <div className="oddk-dialogActions oddk-splitFooter"><button type="button" className="oddk-dialogCancel" onClick={onCancel}>원문으로 돌아가기</button><button type="submit" form="task-split-confirm" className="oddk-primary" disabled={!titles.length}>{titles.length}개 추가</button></div>
  </>;
}
