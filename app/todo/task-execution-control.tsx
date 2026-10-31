"use client";

import { HiOutlinePlay } from "react-icons/hi2";
import type { Task } from "../../supabase/functions/_shared/plan";
import type { ExecutionRecord } from "../../supabase/functions/_shared/execution";
import { latestFinishedExecution, finishedExecutionSummary } from "./execution-history";
import { formatExecutionClock } from "./execution-timer";

export function TaskExecutionControl({ task, currentTaskId, records, date, disabled, onStart }: {
  task: Task; currentTaskId?: string; records: ExecutionRecord[]; date: string;
  disabled: boolean; onStart: (task: Task) => void;
}) {
  if (task.summaryOnly) return null;
  const recording = task.id === currentTaskId;
  const recent = latestFinishedExecution(records, task.id);
  const actual = recent ? finishedExecutionSummary(recent, date) : null;
  if (task.done && !actual) return null;
  return <div className="oddk-taskExecution" data-recording={recording}>
    {!task.done && <button type="button" className="oddk-recordStart" aria-label={`${task.title} ${recording ? "기록 중" : "작업 시작"}`}
      disabled={disabled || Boolean(currentTaskId)} onClick={() => { if (!disabled && !currentTaskId) onStart(task); }}>
      <HiOutlinePlay aria-hidden="true" />{recording ? "기록 중" : "작업 시작"}
    </button>}
    {actual && <span className="oddk-taskExecutionActual">최근 수행 · 작업 {formatExecutionClock(actual.workMs)} · 휴식 {formatExecutionClock(actual.breakMs)}</span>}
  </div>;
}
