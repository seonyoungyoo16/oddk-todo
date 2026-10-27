import { useState } from "react";
import { HiOutlineChevronDown, HiOutlinePlus, HiOutlineTrash, HiOutlineClock } from "react-icons/hi2";
import type { Task } from "../../supabase/functions/_shared/plan";
import { isPlanDate } from "../../supabase/functions/_shared/calendar";
import { defaultAvailability, validAvailability } from "../../supabase/functions/_shared/schedule";
import type { Availability } from "../../supabase/functions/_shared/schedule";
import type { DayPlan } from "./day-selectors";
import { availabilitySummary } from "./availability";
import { useLocalDraft, DraftFeedback } from "./use-local-draft";
import { emptyAvailabilityDrafts, validAvailabilityDrafts } from "./availability-draft";
import { sameValue } from "./json-equality";
import { clockLabel } from "./timeline";

export function DayAvailability({ day, saved, onSave, onEdit }: { day: DayPlan; saved?: Availability; onSave: (value: Availability) => boolean; onEdit: (task: Task) => void }) {
  const drafts = useLocalDraft("availability", emptyAvailabilityDrafts, validAvailabilityDrafts);
  const current = saved ?? defaultAvailability, entry = drafts.value[day.date], value = entry?.value ?? current;
  const conflict = Boolean(entry && !sameValue(entry.value, current) && !sameValue(entry.base, current));
  const [error, setError] = useState<{ date: string; text: string } | null>(null);
  const report = (text: string) => setError({ date: day.date, text });
  const summary = availabilitySummary(day, current);
  function update(next: Availability) {
    if (!isPlanDate(day.date)) return;
    drafts.set(all => ({ ...all, [day.date]: { base: all[day.date]?.base ?? current, value: next } })); setError(null);
  }
  function discard() { drafts.set(all => { const next = { ...all }; delete next[day.date]; return next; }); setError(null); }
  return <section className="oddk-availability" aria-label="하루 시간 배분">
    <div className="oddk-allocationSummary"><div><span>설정한 계획</span><strong>{day.activeTotal}분</strong><small>작업 {day.activeWork} + 여유 {day.activeBuffer}분</small></div><div><span>빈 시간</span><strong>{summary.freeMinutes}분</strong><small>활동 구간 내 실제 빈 시간대</small></div><div><span>아직 미배치</span><strong>{summary.unscheduledMinutes}분</strong><small>소요시간만 정한 계획</small></div></div>
    <p className="oddk-allocationContext">{current.start}~{current.end} · 활동 {summary.activityMinutes}분 중 고정·휴식 {summary.fixedMinutes}분 · 시간표 점유 {summary.occupiedMinutes}분{summary.occupiedWithin !== summary.occupiedMinutes && ` (활동 구간 안 ${summary.occupiedWithin}분)`}{!saved && " · 기본 활동 구간"}</p>
    {day.activeTotal > summary.availableMinutes && <p className="oddk-timeWarning">설정한 계획이 고정·휴식을 제외한 활동 가능 시간보다 {day.activeTotal - summary.availableMinutes}분 많아요. 일부 계획을 다른 날짜로 옮기거나 활동 구간을 조정해주세요.</p>}
    {summary.overlapMinutes > 0 && <p className="oddk-timeWarning">시간표의 계획 합계 {day.activeTotal - summary.unscheduledMinutes}분 중 {summary.overlapMinutes}분이 겹쳐요. 겹침을 해소한 뒤 남은 업무를 배치해주세요.</p>}
    {summary.overlaps.length > 0 && <ul className="oddk-timeWarnings" aria-label="일정 충돌">{summary.overlaps.map(({ task, others, fixed }) => <li key={task.id}><button type="button" onClick={() => onEdit(task)}>{task.title}</button><span> · {clockLabel(task.start)}~{clockLabel(task.end)} 겹침: </span>{others.map((other, i) => <span key={other.id}>{i > 0 && ", "}<button type="button" onClick={() => onEdit(other)}>{other.title}</button></span>)}{fixed.map(block => <span key={block.id}> {block.title} (고정·휴식)</span>)}</li>)}</ul>}
    {summary.outside.length > 0 && <p className="oddk-timeWarning">활동 구간 밖: {summary.outside.map((task, i) => <span key={task.id}>{i > 0 && ", "}<button type="button" onClick={() => onEdit(task)}>{task.title}</button></span>)}</p>}
    <details className="oddk-availabilitySettings"><summary><HiOutlineChevronDown aria-hidden="true" />활동 시간·고정·휴식 설정 {entry && <small>작성 중</small>}</summary>
      <form onSubmit={event => { event.preventDefault(); if (conflict) { report("저장된 활동 설정이 바뀌었어요. 아래에서 사용할 내용을 선택해주세요."); return; } if (!validAvailability(value)) { report("활동 종료는 시작 이후로, 고정·휴식의 제목과 시작·종료도 모두 입력해주세요. 자정 종료는 00:00으로 입력하세요."); return; } if (onSave(value)) discard(); else report("활동 설정을 저장하지 못했어요. 초안은 남아 있으니 저장 공간을 확인한 뒤 다시 적용해주세요."); }}>
        <p>선택 날짜에만 적용해요. 종료 00:00은 이 날짜의 자정(24:00)이에요.</p>
        <div className="oddk-availabilityHours"><label>활동 시작<input type="time" step={60} required value={value.start} onChange={e => update({ ...value, start: e.target.value })} /></label><label>활동 종료<input type="time" step={60} required value={value.end === "24:00" ? "00:00" : value.end} onChange={e => update({ ...value, end: e.target.value === "00:00" ? "24:00" : e.target.value })} /></label></div>
        <div className="oddk-fixedHeading"><strong>고정·휴식</strong><button type="button" disabled={value.fixed.length >= 30} onClick={() => update({ ...value, fixed: [...value.fixed, { id: crypto.randomUUID(), title: "", start: "", end: "" }] })}><HiOutlinePlus aria-hidden="true" />구간 추가</button></div>
        {value.fixed.map((block, index) => <fieldset key={block.id} className="oddk-fixedEditor"><legend>고정·휴식 {index + 1}</legend><label>이름<input maxLength={60} required value={block.title} placeholder="예: 점심, 고정 회의" onChange={e => update({ ...value, fixed: value.fixed.map(item => item.id === block.id ? { ...item, title: e.target.value } : item) })} /></label><label>시작<input type="time" step={60} required value={block.start} onChange={e => update({ ...value, fixed: value.fixed.map(item => item.id === block.id ? { ...item, start: e.target.value } : item) })} /></label><label>종료<input type="time" step={60} required value={block.end === "24:00" ? "00:00" : block.end} onChange={e => update({ ...value, fixed: value.fixed.map(item => item.id === block.id ? { ...item, end: e.target.value === "00:00" ? "24:00" : e.target.value } : item) })} /></label><button type="button" aria-label={`고정·휴식 ${index + 1} 삭제`} onClick={() => update({ ...value, fixed: value.fixed.filter(item => item.id !== block.id) })}><HiOutlineTrash aria-hidden="true" /></button></fieldset>)}
        {conflict && <div className="oddk-draftConflict" role="alert"><strong>저장된 활동 설정이 바뀌었어요.</strong><button type="button" onClick={() => { drafts.download(); discard(); }}>초안 백업 후 저장본 사용</button><button type="button" onClick={() => { drafts.download(); drafts.set(all => ({ ...all, [day.date]: { base: current, value } })); }}>백업 후 내 초안 계속 편집</button></div>}
        {error?.date === day.date && <p role="alert" className="oddk-error">{error.text}</p>}<div className="oddk-availabilityActions"><button type="button" disabled={!entry} onClick={discard}>초안 취소</button><button type="submit" disabled={!isPlanDate(day.date)}><HiOutlineClock aria-hidden="true" />이 날짜에 적용</button></div>
        <DraftFeedback draft={drafts} />
      </form>
    </details>
    <details className="oddk-freeSlots"><summary>빈 시간대 보기</summary>{summary.free.length ? <ul>{summary.free.map(slot => <li key={slot.start}>{clockLabel(slot.start)}~{clockLabel(slot.end)} · {slot.end - slot.start}분</li>)}</ul> : <p>활동 구간에 비어 있는 시간이 없어요.</p>}</details>
  </section>;
}
