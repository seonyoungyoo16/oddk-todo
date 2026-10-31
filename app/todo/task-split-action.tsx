"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { HiOutlinePlus, HiOutlineXMark, HiOutlineArrowPath } from "react-icons/hi2";
import { resolveTaskInput } from "./local-task-ai";
import { TaskSplitReview } from "./task-split-review";
export function TaskSplitAction({ source, disabled, onAdd, onBusyChange, onSourceSnapshot, children }: {
  source: string; disabled: boolean; onAdd: (titles: string[], original?: string) => string | null; onBusyChange: (busy: boolean) => void; onSourceSnapshot: (source: string) => void; children: ReactNode;
}) {
  const request = useRef<AbortController | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const currentText = () => formRef.current?.querySelector<HTMLTextAreaElement>("textarea")?.value ?? source;
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [preview, setPreview] = useState<{ source: string; titles: string[] } | null>(null);
  useEffect(() => () => { const current = request.current; request.current = null; current?.abort(); onBusyChange(false); }, [onBusyChange]);
  async function split() {
    const submitted = currentText();
    if (request.current || !submitted.trim()) return;
    const controller = new AbortController(); request.current = controller;
    let focusInput = false;
    // IME can commit the last character before React's source prop catches up.
    if (submitted !== source) onSourceSnapshot(submitted);
    setBusy(true); onBusyChange(true); setError("");
    try {
      const titles = await resolveTaskInput(submitted, controller.signal, location.hostname);
      if (!controller.signal.aborted) {
        if (currentText().trim() !== submitted.trim()) throw Error("다른 화면에서 입력 내용이 바뀌었어요. 내용을 확인하고 추가를 다시 눌러주세요.");
        if (titles.length === 1) {
          const message = onAdd(submitted.trim().length <= 120 ? [submitted.trim()] : titles, submitted);
          if (message) setError(message);
          else focusInput = true;
        } else setPreview({ source: submitted, titles });
      }
    } catch (error) { if (!controller.signal.aborted) setError((error as Error).message); }
    finally { if (request.current === controller) { request.current = null; setBusy(false); onBusyChange(false); if (focusInput || controller.signal.aborted) requestAnimationFrame(() => document.getElementById("todo-input")?.focus()); } }
  }
  return <form ref={formRef} className="oddk-addForm" onInput={() => setError("")} onSubmit={event => { event.preventDefault(); if (!disabled) void split(); }}>
    {children}
    <div className="oddk-composerFooter">
      <small id="todo-input-count" className="oddk-inputCount">{source.length > 0 ? `${source.length}/2000` : ""}</small>
      {busy && <button type="button" className="oddk-stopSplit" aria-label="할 일 분석 중단" onClick={() => request.current?.abort()}><HiOutlineXMark aria-hidden="true" />중단</button>}
      <button type="submit" aria-label="할 일 추가" disabled={disabled || busy || !source.trim()}>{busy ? <HiOutlineArrowPath className="oddk-submitSpinner" aria-hidden="true" /> : <HiOutlinePlus aria-hidden="true" />}{busy ? "확인 중…" : "추가"}</button>
      {error && <p className="oddk-aiSplitError" role="alert">{error}</p>}
    </div>
    {preview && createPortal(<TaskSplitReview source={preview.source} candidates={preview.titles} onCancel={() => setPreview(null)} onAdd={titles => { if (currentText().trim() !== preview.source.trim()) return "입력 내용이 바뀌었어요. 취소 후 현재 내용으로 다시 추가해주세요."; const message = onAdd(titles); if (!message) setPreview(null); return message; }} />, document.querySelector(".oddk-page") ?? document.body)}
  </form>;
}
