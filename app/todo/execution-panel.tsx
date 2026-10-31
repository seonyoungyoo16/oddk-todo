"use client";
import { useEffect, useRef, useState } from "react";
import { HiOutlineArrowDownTray, HiOutlineArrowUpTray, HiOutlineClock, HiOutlinePause, HiOutlinePlay, HiOutlineStop, HiOutlineXMark } from "react-icons/hi2";
import { executionPhase, executionTotals } from "../../supabase/functions/_shared/execution";
import type { ExecutionRecord } from "../../supabase/functions/_shared/execution";
import type { Plan, Task } from "../../supabase/functions/_shared/plan";
import { selectDay } from "./day-selectors";
import { keepFocusInDialog } from "./dialog-focus";
import type { ExecutionController } from "./use-execution";
import { DraftFeedback, useLocalDraft } from "./use-local-draft";
import { initialExecutionEditor, previewExecutionEditor, validExecutionEditor } from "./execution-editor-model";
import { sameValue } from "./json-equality";
import { downloadExecutionBackup } from "./execution-client";
import { localExecutionTransaction } from "./execution-idb";
import { parseExecutionBackup } from "./execution-local-model";
import { formatExecutionClock } from "./execution-timer";

const minutes = (ms: number) => `${Math.round(ms / 6000) / 10}분`;
const label = (iso: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(iso));
function useRecordedNow(source: string | undefined) {
  const [clock, setClock] = useState({ source: "", value: "" });
  useEffect(() => {
    if (!source) return;
    const anchor = performance.now(), start = Date.parse(source);
    const tick = () => setClock({ source, value: new Date(start + Math.max(0, performance.now() - anchor)).toISOString() });
    const timer = setInterval(tick, 1000); return () => clearInterval(timer);
  }, [source]);
  return clock.source === source ? clock.value : source;
}
function useRecordDialog() {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current, opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal(); return () => { dialog?.close(); if (opener?.isConnected) opener.focus(); else document.getElementById("todo-input")?.focus(); };
  }, []);
  return ref;
}
function RecordFeedback({ model }: { model: ExecutionController }) {
  return <>{model.error && <p role="alert" className="oddk-error">{model.error}</p>}{model.pending && <div className="oddk-recordActions"><span>이전 조작의 저장 결과를 먼저 확인해주세요.</span><button type="button" disabled={model.busy} onClick={() => void model.retry()}>같은 요청으로 결과 확인</button><button type="button" disabled={model.busy || !model.state} onClick={model.clearPending}>현재 상태 기준으로 새로 조작</button></div>}</>;
}
export function ExecutionPanel({ compact = false, docked = false, scope, plan, date, model, switchTask, onCancelSwitch }: { compact?: boolean; docked?: boolean; scope: string; plan: Plan; date: string; model: ExecutionController; switchTask: { task: Task; from: string } | null; onCancelSwitch: () => void }) {
  const now = useRecordedNow(model.state?.now), current = model.state?.current;
  const [editing, setEditing] = useState<{ record: ExecutionRecord | null } | null>(null), [importing, setImporting] = useState<ExecutionRecord[] | null>(null), [localError, setLocalError] = useState("");
  const suspendPolling = model.suspendPolling;
  useEffect(() => { suspendPolling(editing !== null); return () => suspendPolling(false); }, [editing, suspendPolling]);
  const day = selectDay(plan.tasks, date), phase = current ? executionPhase(current) : null;
  const elapsed = current && now ? executionTotals(current, now) : null;
  const disabled = model.busy || !model.state || Boolean(model.pending);
  const dockRef = useRef<HTMLElement>(null);
  const showDock = Boolean(current || model.pending || model.error);
  useEffect(() => {
    if (!docked || !showDock) return;
    const element = dockRef.current, page = element?.closest<HTMLElement>(".oddk-page");
    if (!element || !page) return;
    const measure = () => page.style.setProperty("--execution-dock-height", `${element.getBoundingClientRect().height}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => { observer.disconnect(); page.style.removeProperty("--execution-dock-height"); };
  }, [docked, showDock]);
  async function exportRecords() {
    try {
      if (scope === "local") downloadExecutionBackup((await localExecutionTransaction(v => v)).records);
      else if (model.history) downloadExecutionBackup(model.history.records);
    } catch (error) { setLocalError(error instanceof Error ? error.message : "실적 백업을 받지 못했어요."); }
  }
  if (docked && !showDock) return null;
  return <section ref={dockRef} className={"oddk-execution" + (compact ? " oddk-executionCompact" : "") + (docked ? " oddk-executionDock" : "")} aria-label={docked ? "작업 타이머" : "실제 시간 기록"}>
    {(!compact || current) && <div className="oddk-recordCurrent">
      <div><strong><HiOutlineClock aria-hidden="true" />{current ? phase === "work" ? "작업 기록 중" : phase === "break" ? "휴식 중 · 작업시간 정지" : "일시정지" : "실제 시간 기록"}</strong><p>{current?.title ?? "목록의 작업 시작을 눌러주세요."}</p>
        {elapsed && <span>작업 <b>{docked ? formatExecutionClock(elapsed.workMs) : minutes(elapsed.workMs)}</b> · 휴식 <b>{docked ? formatExecutionClock(elapsed.breakMs) : minutes(elapsed.breakMs)}</b></span>}
      </div>
      {docked && elapsed && <div className="oddk-executionWorkClock"><span>작업시간</span><output className="oddk-executionClock" role="timer" aria-label="누적 작업 시간" aria-live="off">{formatExecutionClock(elapsed.workMs)}</output></div>}
      {current && <div className="oddk-recordActions">
        <button type="button" disabled={disabled || phase === "work"} onClick={() => void model.command({ type: "resume", recordId: current.id })}><HiOutlinePlay aria-hidden="true" />{phase === "paused" ? "다시 시작" : "작업으로"}</button>
        <button type="button" disabled={disabled || phase === "paused"} onClick={() => void model.command({ type: "pause", recordId: current.id })}><HiOutlinePause aria-hidden="true" />일시정지</button>
        <button type="button" disabled={disabled || phase === "break"} onClick={() => void model.command({ type: "break", recordId: current.id })}>휴식 시작</button>
        <button type="button" disabled={disabled} onClick={() => void model.command({ type: "stop", recordId: current.id })}><HiOutlineStop aria-hidden="true" />기록 종료</button>
      </div>}
    </div>}
    <RecordFeedback model={model} />
    {localError && <p role="alert" className="oddk-error">{localError}</p>}
    {!compact && <div className="oddk-recordMeta"><small>{scope === "local" ? "이 브라우저에 기록 · 로그인 기록과 별도 보관" : "계정에 기록 · 서버 연결 후 조작 확정"}{model.state && ` · 마지막 확인 ${label(model.state.now)} (한국 시간)`}</small><button type="button" disabled={model.busy} onClick={() => void model.refresh().catch(e => setLocalError(e.message))}>현재 상태 확인</button></div>}
    {!compact && model.message && <p role="status">{model.message}</p>}
    {!compact && <details className="oddk-recordHistory">
      <summary>{date || "선택 날짜"} · 계획과 실제 비교</summary>
      <p>전체 할 일 기준 · 계획값은 그대로 두고 실제 수행 날짜로 합산해요. 기록 종료와 할 일 완료는 별개예요.</p>
      <div className="oddk-recordComparison">
        <div><span>계획</span><strong>작업 {day.work}분 · 여유 {day.buffer}분</strong><small>수행 {day.total}분 · 할 일당 한 번</small></div>
        <div><span>실제</span><strong>작업 {minutes(model.history?.totals.workMs ?? 0)} · 휴식 {minutes(model.history?.totals.breakMs ?? 0)}</strong><small>일시정지 제외 · 날짜 전체 합계</small></div>
        <div><span>작업 시간 차이</span><strong>{model.history ? `${model.history.totals.workMs - day.work * 60000 >= 0 ? "+" : "−"}${minutes(Math.abs(model.history.totals.workMs - day.work * 60000))}` : "불러오는 중"}</strong><small>실제 작업 − 이 날짜 계획 작업</small></div>
      </div>
      <div className="oddk-recordActions"><button type="button" disabled={disabled} onClick={() => setEditing({ record: null })}>실제 시간 직접 입력</button><button type="button" disabled={!model.history || model.busy} onClick={() => void exportRecords()}><HiOutlineArrowDownTray aria-hidden="true" />{scope === "local" ? "브라우저 전체 실적 백업" : "불러온 날짜 실적 백업"}</button><label className="oddk-recordFile"><HiOutlineArrowUpTray aria-hidden="true" />실적 백업 불러오기<input type="file" accept="application/json,.json" disabled={model.busy} onChange={async event => { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; try { if (file.size > 10 * 1024 * 1024) throw new Error("실적 백업은10MB까지 읽을 수 있어요."); setImporting(parseExecutionBackup(await file.text()).records); setLocalError(""); } catch (e) { setLocalError(e instanceof Error ? e.message : "실적 파일을 읽지 못했어요."); } }} /></label>
        {scope !== "local" && <button type="button" disabled={model.busy} onClick={() => void localExecutionTransaction(v => v).then(v => setImporting(v.records)).catch(e => setLocalError(e.message))}>이 브라우저 기록을 계정으로 가져오기</button>}
      </div>
      <ul>{model.history?.records.map(record => {
        const totals = executionTotals(record, model.history!.now, date);
        return <li key={record.id}><div><strong>{record.title}</strong><span>{label(record.startedAt)} ~ {record.endedAt ? label(record.endedAt) : "기록 중"}</span><span>이 날짜 작업 {minutes(totals.workMs)} · 휴식 {minutes(totals.breakMs)}</span><small>시작 당시 계획: {record.plannedWorkMinutes === null ? "미설정" : `작업 ${record.plannedWorkMinutes}분 / 수행 ${record.plannedTotalMinutes}분`}{record.needsReview ? " · 24시간에서 종료됨, 실제 구간을 확인해주세요" : record.finishReason === "manual" ? " · 직접 입력·보정" : record.finishReason === "completed" ? " · 할 일 완료로 종료" : record.finishReason === "removed" ? " · 할 일 삭제로 종료" : ""}</small></div><button type="button" disabled={disabled || record.endedAt === null} onClick={() => setEditing({ record })}>실제 시간 보정</button></li>;
      })}</ul>
      {model.history?.records.length === 0 && <p>이 날짜에 수행한 기록이 없어요.</p>}
      {model.history?.cursor && <button type="button" disabled={model.busy} onClick={() => void model.refresh(model.history!.cursor).catch(e => setLocalError(e.message))}>이력 더 보기 · 합계는 날짜 전체 기준</button>}
    </details>}
    {editing && <ExecutionEditor key={editing.record?.id ?? "manual"} record={editing.record} plan={plan} model={model} onClose={() => setEditing(null)} />}
    {switchTask && <SwitchRecord task={switchTask.task} from={switchTask.from} model={model} onClose={onCancelSwitch} />}
    {importing && <ImportRecords key={scope} records={importing} scope={scope} plan={plan} model={model} onClose={() => setImporting(null)} />}
  </section>;
}
function SwitchRecord({ task, from, model, onClose }: { task: Task; from: string; model: ExecutionController; onClose: () => void }) {
  const ref = useRecordDialog(), stale = model.state?.current?.id !== from;
  return <dialog ref={ref} className="oddk-dialog oddk-recordDialog" aria-labelledby="record-switch-title" onKeyDown={keepFocusInDialog} onCancel={event => { event.preventDefault(); if (!model.busy) onClose(); }}><div className="oddk-dialogForm"><header className="oddk-dialogHeader"><h2 id="record-switch-title">작업을 전환할까요?</h2><button type="button" aria-label="작업 전환 닫기" disabled={model.busy} onClick={onClose}><HiOutlineXMark /></button></header><p>현재 기록을 종료하고 <strong>{task.title}</strong>의 작업 기록을 시작해요. 두 변경을 함께 저장해요.</p>{stale && <p role="alert">현재 기록이 바뀌었어요. 닫은 뒤 다시 선택해주세요.</p>}<RecordFeedback model={model} /><div className="oddk-recordActions"><button type="button" disabled={model.busy} onClick={onClose}>취소</button><button type="button" disabled={model.busy || stale || Boolean(model.pending)} onClick={async () => { if (await model.command({ type: "switch", taskId: task.id, fromRecordId: from })) onClose(); }}>종료하고 작업 전환</button></div></div></dialog>;
}
function ExecutionEditor({ record, plan, model, onClose }: { record: ExecutionRecord | null; plan: Plan; model: ExecutionController; onClose: () => void }) {
  const ref = useRecordDialog(), draft = useLocalDraft(`execution-${record?.id ?? "manual"}`, initialExecutionEditor(record), validExecutionEditor);
  const [confirmed, setConfirmed] = useState(false);
  const [revision, setRevision] = useState(model.state?.revision ?? -1);
  const task = plan.tasks.find(t => t.id === draft.value.taskId), now = useRecordedNow(model.state?.now);
  let preview: ExecutionRecord | null = null, validation = "";
  try { if (now) preview = previewExecutionEditor(draft.value, task, now); } catch (e) { validation = e instanceof Error ? e.message : "시간 입력을 확인해주세요."; }
  const latest = record ? model.history?.records.find(r => r.id === record.id) : null;
  const stale = revision !== model.state?.revision || record !== null && !sameValue(draft.value.expected, latest);
  const totals = preview && now ? executionTotals(preview, now) : null;
  const before = record && now ? executionTotals(record, now) : null;
  const disabled = model.busy || Boolean(model.pending);
  return <dialog ref={ref} className="oddk-dialog oddk-recordDialog" aria-labelledby="record-editor-title" onKeyDown={keepFocusInDialog} onCancel={event => { event.preventDefault(); if (!model.busy) onClose(); }}><form className="oddk-dialogForm" onSubmit={async event => {
    event.preventDefault(); if (!preview || stale || !confirmed || disabled) return;
    const command = record ? { type: "correct" as const, recordId: record.id, segments: preview.segments } : { type: "manual" as const, taskId: draft.value.taskId, segments: preview.segments };
    if (await model.command(command, revision)) { draft.set(initialExecutionEditor(record ? preview : null)); onClose(); }
  }}><header className="oddk-dialogHeader"><h2 id="record-editor-title">{record ? "실제 시간 보정" : "실제 시간 직접 입력"}</h2><button type="button" aria-label="실제 시간 입력 닫기" disabled={model.busy} onClick={onClose}><HiOutlineXMark /></button></header>
    <p>실제로 작업하거나 쉰 구간만 입력해주세요. 구간 사이의 공백은 일시정지로 남고 계획 시간은 바뀌지 않아요. 한국 시간 기준이에요.</p>
    {record ? <strong>{record.title}</strong> : <label className="oddk-dialogField">기록할 할 일<select value={draft.value.taskId} disabled={disabled} onChange={e => { draft.set(v => ({ ...v, taskId: e.target.value })); setConfirmed(false); }} required><option value="">할 일 선택</option>{plan.tasks.filter(t => !t.summaryOnly).map(t => <option key={t.id} value={t.id}>{t.done ? "완료 · " : ""}{t.title}</option>)}</select></label>}
    {draft.value.rows.map((row, index) => <fieldset className="oddk-recordRow" key={index}><legend>구간 {index + 1}</legend><label>종류<select value={row.kind} disabled={disabled} onChange={e => { draft.set(v => ({ ...v, rows: v.rows.map((r, i) => i === index ? { ...r, kind: e.target.value as "work" | "break" } : r) })); setConfirmed(false); }}><option value="work">작업</option><option value="break">휴식</option></select></label>{(["start", "end"] as const).map(field => <label key={field}>{field === "start" ? "시작" : "종료"}<input type="datetime-local" step="0.001" min="0001-01-01T00:00" max="9999-12-31T23:59:59.999" required value={row[field]} disabled={disabled} onChange={e => { draft.set(v => ({ ...v, rows: v.rows.map((r, i) => i === index ? { ...r, [field]: e.target.value } : r) })); setConfirmed(false); }} /></label>)}<button type="button" disabled={disabled || draft.value.rows.length === 1} onClick={() => { draft.set(v => ({ ...v, rows: v.rows.filter((_, i) => i !== index) })); setConfirmed(false); }}>이 구간 제거</button></fieldset>)}
    <button type="button" disabled={disabled || draft.value.rows.length >= 64} onClick={() => { draft.set(v => ({ ...v, rows: [...v.rows, { kind: "work", start: "", end: "" }] })); setConfirmed(false); }}>구간 추가</button>
    {validation && <p role="status">{validation}</p>}{stale && <><p role="alert">다른 창에서 시간 기록 상태를 바꿨어요. 입력은 보관했어요. 최신 기록을 확인한 뒤 다시 보정해주세요.</p>{latest ? <button type="button" disabled={disabled} onClick={() => { draft.download(); draft.set(initialExecutionEditor(latest)); setRevision(model.state?.revision ?? -1); setConfirmed(false); }}>이전 입력 백업하고 최신 기록으로 시작</button> : record === null && <button type="button" disabled={disabled} onClick={() => { setRevision(model.state?.revision ?? -1); setConfirmed(false); }}>입력 유지하고 최신 상태로 다시 확인</button>}</>}
    {totals && <output className="oddk-recordPreview">{before && <span>이전 작업 {minutes(before.workMs)} · 휴식 {minutes(before.breakMs)} → </span>}저장할 작업 {minutes(totals.workMs)} · 휴식 {minutes(totals.breakMs)} · 계획값 유지</output>}
    <DraftFeedback draft={draft} /><RecordFeedback model={model} />
    <label className="oddk-recordConfirm"><input type="checkbox" checked={confirmed} disabled={disabled || !preview || stale} onChange={e => setConfirmed(e.target.checked)} />실제 구간과 변경 결과를 확인했어요</label>
    <div className="oddk-recordActions"><button type="button" disabled={model.busy} onClick={onClose}>입력 보관하고 닫기</button><button type="submit" disabled={disabled || !preview || stale || !confirmed || Boolean(draft.problem)}>실제 기록 저장</button></div>
  </form></dialog>;
}
function ImportRecords({ records, scope, plan, model, onClose }: { records: ExecutionRecord[]; scope: string; plan: Plan; model: ExecutionController; onClose: () => void }) {
  const ref = useRecordDialog(), closed = records.filter(r => r.endedAt !== null);
  const [confirmed, setConfirmed] = useState(false), [mapping, setMapping] = useState<Record<string, string>>({}), [done, setDone] = useState<string[]>([]), [count, setCount] = useState(10), [error, setError] = useState("");
  async function restoreAll() {
    try { downloadExecutionBackup((await localExecutionTransaction(v => v)).records); if (await model.restore(closed)) onClose(); }
    catch { setError("기존 실적을 백업하지 못해 가져오기를 멈췄어요. 원본과 기존 기록은 유지했어요."); }
  }
  return <dialog ref={ref} className="oddk-dialog oddk-recordDialog" aria-labelledby="record-import-title" onKeyDown={keepFocusInDialog} onCancel={event => { event.preventDefault(); if (!model.busy) onClose(); }}><div className="oddk-dialogForm"><header className="oddk-dialogHeader"><h2 id="record-import-title">실적 가져오기 확인</h2><button type="button" aria-label="실적 가져오기 닫기" disabled={model.busy} onClick={onClose}><HiOutlineXMark /></button></header>
    <p>종료 기록 {closed.length}개 · 진행 중 {records.length - closed.length}개는 제외해요. 기존 기록을 덮지 않으며 겹치는 구간은 거부해요. 가져오기 전 원본 백업을 내려받아요.</p>
    {scope !== "local" && <p>계정의 할 일과 하나씩 연결해주세요. 실제 시간은 유지하고 시작 당시 계획 정보는 선택한 할 일의 현재 값으로 기록해요. 같은 ID는 중복 생성하지 않아요.</p>}
    <label className="oddk-recordConfirm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} disabled={model.busy} />종료한 실제 기록과 가져올 계정을 확인했어요</label>
    <ul className="oddk-recordImportList">{closed.slice(0, count).map(record => <li key={record.id}><strong>{record.title}</strong><span>{label(record.startedAt)} ~ {label(record.endedAt!)}</span>{scope !== "local" && <><label>연결할 할 일<select disabled={model.busy || done.includes(record.id)} value={mapping[record.id] ?? (plan.tasks.some(t => t.id === record.taskId && !t.summaryOnly) ? record.taskId : "")} onChange={e => setMapping(v => ({ ...v, [record.id]: e.target.value }))}><option value="">할 일 선택</option>{plan.tasks.filter(t => !t.summaryOnly).map(t => <option value={t.id} key={t.id}>{t.title}</option>)}</select></label><button type="button" disabled={!confirmed || model.busy || Boolean(model.pending) || done.includes(record.id) || !(mapping[record.id] ?? plan.tasks.find(t => t.id === record.taskId && !t.summaryOnly)?.id)} onClick={async () => { downloadExecutionBackup(records); const taskId = mapping[record.id] ?? record.taskId; if (await model.importRecord(record, taskId)) setDone(v => [...v, record.id]); }}>{done.includes(record.id) ? "가져옴" : "이 기록 계정으로 가져오기"}</button></>}</li>)}</ul>
    {closed.length > count && <button type="button" onClick={() => setCount(count + 10)}>가져올 기록 더 보기</button>}
    {error && <p role="alert" className="oddk-error">{error}</p>}<RecordFeedback model={model} /><div className="oddk-recordActions"><button type="button" disabled={model.busy} onClick={onClose}>닫기</button>{scope === "local" && <button type="button" disabled={!confirmed || model.busy || !closed.length} onClick={() => void restoreAll()}>기존 실적 백업 후 가져오기</button>}</div>
  </div></dialog>;
}
