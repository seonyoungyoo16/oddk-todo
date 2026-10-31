"use client";
import { useRef, useState } from "react";
import type { ExecutionController } from "./use-execution";
import { DialogHeader } from "./ui/dialog-header";
import { keepFocusInDialog } from "./dialog-focus";
import { formatExecutionClock } from "./execution-timer";
import { finishedExecutionSummary } from "./execution-history";

const clock = (value: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(value));

export function ExecutionHistoryView({ model, date }: { model: ExecutionController; date: string }) {
  const dialog = useRef<HTMLDialogElement>(null), opener = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState("");
  const records = model.history?.records.filter(record => record.endedAt !== null) ?? [];
  async function load(more = false) {
    setError("");
    try { await model.refresh(more ? model.history?.cursor : null); }
    catch (value) { setError(value instanceof Error ? value.message : "수행 기록을 불러오지 못했어요."); }
  }
  return <>
    <button ref={opener} type="button" className="oddk-executionHistoryLink" disabled={model.busy} onClick={() => { setError(""); dialog.current?.showModal(); }}>수행 기록</button>
    <dialog ref={dialog} className="oddk-dialog oddk-executionHistoryDialog" aria-labelledby="execution-history-title" onKeyDown={keepFocusInDialog} onClose={() => opener.current?.focus()} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div className="oddk-dialogForm">
        <DialogHeader id="execution-history-title" title="수행 기록" closeLabel="수행 기록 닫기" onClose={() => dialog.current?.close()} />
        <p className="oddk-executionHistoryDate">{date} · 실제 수행한 시간</p>
        {(error || model.error) && <div role="alert" className="oddk-dialogError"><p>{error || model.error}</p><button type="button" disabled={model.busy} onClick={() => void load()}>다시 불러오기</button></div>}
        {!model.history ? <p>기록을 불러오고 있어요.</p> : records.length ? <ul className="oddk-finishedExecutions">{records.map(record => {
          const totals = finishedExecutionSummary(record, date)!;
          return <li key={record.id}><strong>{record.title}</strong><span>{clock(record.startedAt)}–{clock(record.endedAt!)}</span><p>작업 <b>{formatExecutionClock(totals.workMs)}</b> · 휴식 <b>{formatExecutionClock(totals.breakMs)}</b></p></li>;
        })}</ul> : <p className="oddk-executionHistoryEmpty">종료한 수행 기록이 없어요.</p>}
        {model.history?.cursor && <button type="button" className="oddk-executionHistoryLink" disabled={model.busy} onClick={() => void load(true)}>이전 기록 더 보기</button>}
      </div>
    </dialog>
  </>;
}
