"use client";
import { useEffect, useRef } from "react";
import type { Plan, Task } from "../../supabase/functions/_shared/plan";
import { reminderOptions } from "../../supabase/functions/_shared/recurrence";
import type { RepeatDraft, RepeatEditPreview } from "./repeat-editor-model";
import "./repeat-editor.css";
const days = ["월", "화", "수", "목", "금", "토", "일"];
export function RepeatEditorFields({ task, plan, value, reminder, scheduled, canStart, onChange, onReminder }: { task: Task; plan: Plan; value: RepeatDraft; reminder: string; scheduled: boolean; canStart: boolean; onChange: (value: RepeatDraft) => void; onReminder: (value: string) => void }) {
  const source = plan.recurrences?.find(series => series.id === task.repeatSeriesId);
  const configuring = value.action === "create" || value.action === "update";
  return <details className="oddk-repeatFields" open={value.action !== "keep" || undefined}><summary>반복·알림 <small>{source ? "반복 일정" : "선택"}</small></summary>
    {source && <p>원래 발생일 {task.repeatDate}{task.repeatException ? " · 개별 수정한 일정" : ""}</p>}
    <label>반복 설정<select value={value.action} onChange={event => onChange({ ...value, action: event.target.value as RepeatDraft["action"], ...(event.target.value === "create" && !value.seriesId ? { seriesId: crypto.randomUUID() } : {}), ...(event.target.value === "update" && value.scope === "this" ? { scope: "future" as const } : {}) })}>
      <option value="keep">{source ? "이번 일정만 수정" : "반복 안 함"}</option>
      {!source && <option value="create" disabled={!canStart}>반복 시작</option>}
      {source && <><option value="update">반복 설정 변경</option><option value="stop">반복 일정 중단</option><option value="detach">이 일정만 반복에서 분리</option></>}
    </select></label>
    {!source && !canStart && <small>날짜가 있는 미완료 실행 업무에서 반복을 시작할 수 있어요.</small>}
    {source && (value.action === "update" || value.action === "stop") && <label>변경 범위<select value={value.scope} onChange={event => onChange({ ...value, scope: event.target.value as RepeatDraft["scope"] })}>{value.action === "stop" && <option value="this">이번만 건너뛰기</option>}<option value="future">원래 발생일 이후</option><option value="all">전체</option></select></label>}
    {configuring && <div className="oddk-repeatGrid"><label>반복 주기<select value={value.frequency} onChange={event => onChange({ ...value, frequency: event.target.value as RepeatDraft["frequency"], interval: "1" })}><option value="daily">매일</option><option value="weekly">매주</option><option value="monthly">매월</option></select></label><label>간격<input type="number" min={1} max={value.frequency === "daily" ? 365 : value.frequency === "weekly" ? 52 : 12} value={value.interval} onChange={event => onChange({ ...value, interval: event.target.value })} /><small>{value.frequency === "daily" ? "일" : value.frequency === "weekly" ? "주" : "개월"}마다</small></label>
      {value.frequency === "weekly" && <fieldset><legend>반복 요일</legend><div className="oddk-repeatDays">{days.map((day, index) => <label key={day}><input type="checkbox" checked={value.weekdays.includes(index + 1)} onChange={event => onChange({ ...value, weekdays: event.target.checked ? [...value.weekdays, index + 1].sort() : value.weekdays.filter(value => value !== index + 1) })} />{day}</label>)}</div></fieldset>}
      {value.frequency === "monthly" && <p>시작일과 같은 일자에 반복해요. 그 일자가 없는 달은 건너뛰어요.</p>}
      <label>반복 종료일 <small>비우면 계속</small><input type="date" min="0001-01-01" max="9999-12-31" value={value.until} onChange={event => onChange({ ...value, until: event.target.value })} /></label>
      <p>시작일은 현재 할 일의 날짜예요. 이후·전체 변경은 원래 발생일을 기준으로 하며, 완료 기록과 다른 개별 수정은 유지해요.</p>
    </div>}
    {value.action === "stop" && <p>선택 범위의 미완료 일정을 지워요. 완료 기록은 남아요. 내용 수정은 먼저 저장한 뒤 중단해주세요.</p>}
    {value.action === "detach" && <p>이 일정의 내용·날짜는 유지하고 반복 연결만 풀어요. 다른 날짜는 계속 반복해요.</p>}
    <label>시작 알림<select value={scheduled ? reminder : ""} disabled={!scheduled || value.action === "stop"} onChange={event => onReminder(event.target.value)}><option value="">알림 없음</option>{reminderOptions.map(minutes => <option key={minutes} value={String(minutes)}>{minutes === 0 ? "시작 시각" : `${minutes}분 전`}</option>)}</select></label>
    <small>{scheduled ? "로그인 후 ‘내 정보 → 일정 알림’에서 이 기기의 알림을 켜주세요. 기기 권한은 여기서 자동 요청하지 않아요." : "날짜와 시작·종료 시각을 정하면 알림을 설정할 수 있어요. 시각을 지우고 저장하면 기존 알림 설정도 해제돼요."}</small>
  </details>;
}
export function RepeatEditSummary({ preview, stale, onBack }: { preview: RepeatEditPreview; stale: boolean; onBack: () => void }) {
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => { title.current?.focus(); title.current?.scrollIntoView({ block: "nearest" }); }, []);
  return <section className="oddk-repeatConfirm" aria-labelledby="repeat-confirm-title" role="status"><h3 ref={title} tabIndex={-1} id="repeat-confirm-title">변경 범위를 확인해주세요</h3><p>추가 {preview.created}개 · 수정 {preview.changed}개 · 삭제 {preview.removed}개 · 완료 기록 {preview.protectedDone}개 유지</p><p>범위: {preview.draft.action === "create" ? "반복 시작" : preview.draft.action === "detach" ? "이 일정만 분리" : preview.draft.scope === "this" ? "이번만" : preview.draft.scope === "future" ? "원래 발생일부터 이후" : "전체"}</p><p>저장 후 실행 취소로 되돌릴 수 있어요.{preview.draft.action === "create" || preview.draft.action === "update" ? " 앞으로31일 범위의 발생을 먼저 준비해요." : ""}</p>{stale && <p role="alert">계획이 바뀌었어요. 입력을 유지한 채 변경 범위를 다시 확인해주세요.</p>}<button type="button" onClick={onBack}>설정으로 돌아가기</button></section>;
}
