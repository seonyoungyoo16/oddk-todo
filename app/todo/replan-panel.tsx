"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Plan } from "../../supabase/functions/_shared/plan";
import { assertCurrentReplan, defaultReplanPins, previewReplan, replanClock } from "../../supabase/functions/_shared/replan";
import type { ReplanPreview } from "../../supabase/functions/_shared/replan";
import type { ExecutionController } from "./use-execution";
import { commitReplan } from "./replan-client";
import { currentExecutionPlan } from "./execution-client";
import { getPlanScope, getSyncSnapshot, getServerSyncSnapshot, subscribeSync } from "./sync-store";
import { makeReplanRecovery, restoreReplanRecovery, validReplanRecovery } from "./replan-recovery";
import type { ReplanRecovery } from "./replan-recovery";
import { useLocalDraft, DraftFeedback } from "./use-local-draft";
import { keepFocusInDialog } from "./dialog-focus";
import "./replan.css";

export function ReplanPanel({ scope, date, today, plan, execution, onApplied, onRestore }: {
  scope: string; date: string; today: string; plan: Plan; execution: ExecutionController;
  onApplied: (preview: ReplanPreview) => void; onRestore: (plan: Plan) => boolean;
}) {
  const recovery = useLocalDraft<ReplanRecovery | null>("replan-recovery", null, validReplanRecovery);
  const sync = JSON.parse(useSyncExternalStore(subscribeSync, getSyncSnapshot, getServerSyncSnapshot));
  const syncing = scope !== "local" && sync.phase === "syncing";
  const [opened, setOpened] = useState(false), [time, setTime] = useState(""), [pins, setPins] = useState<string[]>([]);
  const [candidate, setCandidate] = useState<{ preview: ReplanPreview; revision: number } | null>(null);
  const [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const dialog = useRef<HTMLDialogElement>(null), opener = useRef<HTMLButtonElement>(null);
  const active = execution.state?.current;
  useEffect(() => { if (opened) dialog.current?.showModal(); else dialog.current?.close(); }, [opened]);
  function close() { if (busy) return; setOpened(false); setCandidate(null); setConfirmed(false); opener.current?.focus(); }
  function open() {
    const clock = replanClock(new Date().toISOString());
    setPins(defaultReplanPins(plan, date, clock.minute)); setTime(""); setCandidate(null); setConfirmed(false); setMessage(""); setOpened(true);
  }
  function preview() {
    try {
      if (!execution.state || execution.state.current || execution.pending || execution.busy) throw new Error("열린 시간 기록을 종료하고 저장 결과를 확인해주세요.");
      const clock = replanClock(new Date().toISOString()), minute = time ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) : clock.minute;
      if (date !== clock.date || minute < clock.minute) throw new Error("오늘의 현재 이후 시각을 선택해주세요.");
      setCandidate({ preview: previewReplan(currentExecutionPlan(scope), { date, baseMinute: minute, pinnedIds: pins }), revision: execution.state.revision });
      setConfirmed(false); setMessage("");
    } catch (e) { setMessage((e as Error).message); }
  }
  async function apply() {
    if (!candidate || !confirmed || busy) return;
    setBusy(true); setMessage("");
    try {
      assertCurrentReplan(candidate.preview, new Date().toISOString());
      const saved = await makeReplanRecovery(candidate.preview);
      if (getPlanScope() !== scope) throw new Error("계정이 바뀌었어요. 현재 계정에서 다시 확인해주세요.");
      if (!recovery.set(saved)) throw new Error("복구안을 저장하지 못해 적용을 멈췄어요. 저장 공간을 확인해주세요.");
      const visible = await commitReplan(scope, candidate.preview, candidate.revision);
      if (getPlanScope() !== scope) return;
      if (!visible) { setMessage("서버에 적용됐지만 기기의 새 변경도 있어요. 동기화 비교 화면을 확인해주세요."); return; }
      onApplied(candidate.preview); setOpened(false); setCandidate(null); setConfirmed(false); setMessage("남은 시간에 맞춰 계획을 재조정했어요."); opener.current?.focus();
      await execution.refresh();
    } catch (e) { if (getPlanScope() === scope) setMessage((e as Error).message); }
    finally { setBusy(false); }
  }
  async function restore() {
    if (!recovery.value || busy) return;
    setBusy(true);
    try {
      const before = currentExecutionPlan(scope), next = await restoreReplanRecovery(before, recovery.value);
      if (getPlanScope() !== scope) return;
      // onRestore has its own synchronous latest-plan guard.
      if (onRestore(next)) setMessage("최근 재조정 전의 시각을 복구했어요.");
    } catch (e) { if (getPlanScope() === scope) setMessage((e as Error).message); }
    finally { setBusy(false); }
  }
  function download(value: Plan, suffix: string) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = `oddk-replan-${suffix}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const result = candidate?.preview;
  return <section className="oddk-replan" aria-label="남은 시간 재조정">
    <div><button type="button" ref={opener} onClick={open} disabled={syncing || date !== today || !execution.state || execution.busy || !!execution.pending || !!active}>남은 시간 재조정</button>
      {recovery.value && <button type="button" disabled={syncing || busy || !!active || !!execution.pending || execution.busy} onClick={() => void restore()}>최근 재조정 시각 복구</button>}</div>
    {active ? <p>진행 중이거나 일시정지한 시간 기록을 먼저 종료해주세요.</p> : date !== today ? <p>재조정은 오늘 계획에서 할 수 있어요.</p> : null}
    {message && <p role="status">{message}</p>}{recovery.problem && <DraftFeedback draft={recovery} />}
    <dialog ref={dialog} className="oddk-replanDialog" aria-labelledby="replan-heading" onCancel={e => { e.preventDefault(); close(); }} onKeyDown={keepFocusInDialog}>
      <h2 id="replan-heading">남은 시간 재조정</h2>
      <p>필터와 관계없이 오늘의 미완료 할 일을 배치해요. 소요 시간과 여유는 줄이지 않아요. 고정·휴식 구간은 항상 유지해요.</p>
      <p>마감 → 중요도 → 우선순위 → 수동 순서로 배치해요. 종료한 실적을 예상 시간에서 자동 차감하지 않아요.</p>
      <label>배치 시작 기준 <input type="time" value={time} disabled={busy} onChange={e => { setTime(e.target.value); setCandidate(null); setConfirmed(false); }} /> <small>한국 시간 · 비우면 현재 시각 이후</small></label>
      <fieldset disabled={busy}><legend>움직이지 않을 일정</legend>{plan.tasks.filter(t => t.plannedDate === date && !t.done && !t.summaryOnly && t.startTime).map(t => <label key={t.id}><input type="checkbox" checked={pins.includes(t.id)} onChange={e => { setPins(p => e.target.checked ? [...p, t.id] : p.filter(id => id !== t.id)); setCandidate(null); setConfirmed(false); }} />{t.startTime} · {t.title}</label>)}</fieldset>
      <button type="button" disabled={busy} onClick={preview}>변경안 미리보기</button>
      {result && <div className="oddk-replanResult">
        <p>빈 시간 {result.availableMinutes}분 · 배치 {result.placedMinutes}분 · 변경 {result.changes.length}개 · 미배치 {result.unplaced.length}개</p>
        {result.errors.map(e => <p role="alert" key={e}>{e}</p>)}
        <h3>변경할 일정</h3>{!result.changes.length && <p>변경할 일정이 없어요.</p>}<ul>{result.changes.map(c => <li key={c.before.id}><strong>{c.before.title}</strong><span>{c.before.startTime ?? "미배치"} → {c.after.startTime ? `${c.after.startTime}~${c.after.endTime}` : "미배치"}</span><small>{c.reason}</small></li>)}</ul>
        {result.protected.length > 0 && <details><summary>유지할 일정 {result.protected.length}개</summary><ul>{result.protected.map(c => <li key={c.task.id}>{c.task.title} · {c.reason}</li>)}</ul></details>}
        {result.unplaced.length > 0 && <><h3>배치하지 못하는 일</h3><ul>{result.unplaced.map(c => <li key={c.task.id}><strong>{c.task.title}</strong><span>{c.reason}</span></li>)}</ul><p>미배치 업무의 기존 시각·시작 알림은 해제해요. 날짜와 소요 시간은 유지해요.</p></>}
        <div><button type="button" onClick={() => download(result.expected, "before")}>원래 계획 백업</button><button type="button" onClick={() => download(result.after, "proposed")}>변경안 백업</button></div>
        <label><input type="checkbox" checked={confirmed} disabled={busy || !!result.errors.length || !result.changes.length} onChange={e => setConfirmed(e.target.checked)} />변경·유지·미배치 내용을 확인했어요.</label>
      </div>}
      {message && <p role="alert">{message}</p>}
      {syncing && <p role="status">기존 변경을 동기화하고 있어요. 끝나면 적용할 수 있어요.</p>}
      <div className="oddk-replanActions"><button type="button" disabled={busy} onClick={close}>취소</button><button type="button" disabled={syncing || busy || !confirmed || !result || !!result.errors.length || !result.changes.length} onClick={() => void apply()}>{busy ? "저장 결과 확인 중…" : "확인한 변경 적용"}</button></div>
    </dialog>
  </section>;
}
