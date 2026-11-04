"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { HiOutlineArrowUpTray, HiOutlineCheck, HiOutlineXMark } from "react-icons/hi2";
import type { Plan } from "../../supabase/functions/_shared/plan";
import { loadPlan } from "../../supabase/functions/_shared/plan-migration";
import { readPlanReplacementTarget, replacePlanFromBackup, subscribePlan, subscribeSync, type PlanReplacementTarget } from "./sync-store";
import { MAX_PLAN_BACKUP_BYTES, parsePlanBackup, planBackupSummaryText, summarizePlanBackup } from "./plan-backup";
import { keepFocusInDialog, openDialogWithFocus, restoreDialogFocus } from "./dialog-focus";

type Preview = { name: string; plan: Plan; target: PlanReplacementTarget };
const changedMessage = "계정이나 현재 내용이 바뀌었어요. 파일을 다시 선택해주세요. 현재 내용은 유지했어요.";

export function PlanBackupImport({ fallback }: { fallback: string }) {
  const fileInput = useRef<HTMLInputElement>(null), selected = useRef<Preview | null>(null), sequence = useRef(0);
  const invalidated = useRef(false);
  const readingTarget = useRef<PlanReplacementTarget | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null), [invalid, setInvalid] = useState(false);
  const [error, setError] = useState(""), [feedback, setFeedback] = useState(""), [reading, setReading] = useState(false);
  const read = useCallback(() => {
    try { return JSON.stringify({ target: readPlanReplacementTarget(fallback) }); }
    catch (error) { return JSON.stringify({ error: error instanceof Error ? error.message : "현재 저장 상태를 확인해주세요." }); }
  }, [fallback]);
  const subscribe = useCallback((notify: () => void) => {
    const check = () => {
      const expected = selected.current?.target ?? readingTarget.current;
      if (expected && read() !== JSON.stringify({ target: expected })) { invalidated.current = true; setInvalid(true); }
      notify();
    };
    const stopPlan = subscribePlan(check), stopSync = subscribeSync(check);
    return () => { stopPlan(); stopSync(); };
  }, [read]);
  const raw = useSyncExternalStore(subscribe, read, () => "{}");
  const current: { target?: PlanReplacementTarget; error?: string } = JSON.parse(raw);
  const close = useCallback(() => { sequence.current++; selected.current = null; readingTarget.current = null; setPreview(null); setReading(false); }, []);
  useEffect(() => () => { sequence.current++; }, []);
  async function choose(file: File) {
    const turn = ++sequence.current;
    setError(""); setFeedback(""); invalidated.current = false; setInvalid(false); setReading(true);
    selected.current = null; readingTarget.current = null; setPreview(null);
    try {
      const target = readPlanReplacementTarget(fallback);
      readingTarget.current = target;
      if (file.size > MAX_PLAN_BACKUP_BYTES) throw Error("백업 파일은 10MB까지 읽을 수 있어요.");
      const plan = parsePlanBackup(await file.text());
      if (turn !== sequence.current) return;
      if (invalidated.current || read() !== JSON.stringify({ target })) throw Error(changedMessage);
      const next = { name: file.name, plan, target };
      selected.current = next; setPreview(next);
    } catch (error) { if (turn === sequence.current) setError(`이 파일은 가져올 수 없어요. ${error instanceof Error ? error.message : "파일을 읽지 못했어요."} 현재 내용은 바뀌지 않았어요.`); }
    finally { if (turn === sequence.current) { readingTarget.current = null; setReading(false); } }
  }
  return <>
    <div className="oddk-settingActionRow oddk-settingDivided"><div className="oddk-settingCopy"><strong>백업 파일 가져오기</strong><p>파일을 확인한 뒤 적용해요.</p></div><button type="button" className="oddk-settingButton" disabled={reading} onClick={() => { setFeedback(""); fileInput.current?.click(); }}><HiOutlineArrowUpTray aria-hidden="true" />{reading ? "파일 확인 중" : "파일 선택"}</button><input ref={fileInput} type="file" hidden accept=".json,application/json" aria-label="계획 백업 파일 선택" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void choose(file); }} /></div>
    {error && <p className="oddk-backupError" role="alert">{error}</p>}
    {feedback && <p className="oddk-settingsFeedback" role="status">{feedback}</p>}
    <p className="oddk-backupFootnote">선택한 파일은 확인을 마친 뒤에만 적용돼요.</p>
    {preview && <PlanBackupDialog preview={preview} invalid={invalid || !current.target || raw !== JSON.stringify({ target: preview.target })} onClose={close} onApply={() => {
      if (invalidated.current || invalid || !selected.current) throw Error(changedMessage);
      // Re-read every gate synchronously at the final explicit replacement.
      replacePlanFromBackup(preview.plan, preview.target, fallback);
      close(); setFeedback(preview.target.scope === "local" ? "백업을 적용했어요. 현재 내용이 선택한 파일로 바뀌었어요." : "백업을 이 기기에 적용했어요. 연결된 기기에는 동기화 후 반영돼요.");
    }} />}
  </>;
}

function PlanBackupDialog({ preview, invalid, onClose, onApply }: { preview: Preview; invalid: boolean; onClose: () => void; onApply: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), title = useRef<HTMLHeadingElement>(null);
  const [confirming, setConfirming] = useState(false), [error, setError] = useState("");
  const summary = summarizePlanBackup(preview.plan), before = loadPlan(preview.target.snapshot);
  useEffect(() => {
    const modal = dialog.current, opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    openDialogWithFocus(modal);
    const ancestors: HTMLElement[] = [];
    for (let node = modal?.parentElement; node; node = node.parentElement) ancestors.push(node);
    const observer = new MutationObserver(() => { if (ancestors.some(node => node.hidden)) onClose(); });
    for (const ancestor of ancestors) observer.observe(ancestor, { attributes: true, attributeFilter: ["hidden"] });
    return () => { observer.disconnect(); modal?.close(); restoreDialogFocus(opener); };
  }, [onClose]);
  return <dialog ref={dialog} className="oddk-dialog oddk-backupDialog" aria-labelledby="backup-import-title" onKeyDown={keepFocusInDialog} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}><div className="oddk-dialogForm">
    <header className="oddk-dialogHeader"><h2 ref={title} tabIndex={-1} id="backup-import-title">{confirming ? "현재 내용을 바꿀까요?" : "가져올 백업을 확인하세요"}</h2><button type="button" aria-label="백업 가져오기 닫기" onClick={onClose}><HiOutlineXMark aria-hidden="true" /></button></header>
    <div className="oddk-backupBody"><p className="oddk-backupFileName">{preview.name}</p><span className="oddk-backupValid"><HiOutlineCheck aria-hidden="true" />읽을 수 있는 백업이에요</span>
      <dl className="oddk-backupSummary">{([["할 일", summary.tasks, "개"], ["목표", summary.goals, "개"], ["계획 날짜", summary.dates, "일"]] as const).map(([label, value, unit]) => <div key={label}><dt>{label}</dt><dd>{value}{unit}</dd></div>)}</dl>
      <p className="oddk-backupTarget">{preview.target.scope === "local" ? "적용 대상: 이 기기의 로그인 전 공간이에요. 다른 계정의 내용은 바뀌지 않아요." : "적용 대상: 현재 계정의 계획이에요. 동기화되면 연결된 다른 기기에도 반영돼요."}</p>
      {confirming ? <div className="oddk-backupReplace"><h3>현재 내용을 바꿉니다</h3><p>현재 할 일·목표·날짜별 계획을 선택한 파일 내용으로 바꿔요.</p>{before.ok && <p>현재 {planBackupSummaryText(before.plan)} → 파일 {planBackupSummaryText(preview.plan)}</p>}</div> : <p>적용 전에는 현재 내용이 바뀌지 않아요.</p>}
      {(invalid || error) && <p role="alert" className="oddk-backupError">{invalid ? changedMessage : error}</p>}
    </div>
    <footer className="oddk-dialogActions"><button type="button" onClick={onClose}>취소</button><button type="button" className="oddk-primary" disabled={invalid} onClick={() => { if (invalid) return; if (!confirming) { setConfirming(true); title.current?.focus(); return; } try { onApply(); } catch (error) { setError(error instanceof Error ? error.message : "저장하지 못했어요. 현재 내용은 유지했어요."); } }}>{confirming ? "현재 내용 바꾸기" : "이 백업 적용"}</button></footer>
  </div></dialog>;
}
