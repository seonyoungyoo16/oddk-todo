import type { EditorDraft } from "./workspace-draft";
import { parseTaskTimeDraft } from "./task-time";
import { deriveScheduleEnd } from "../../supabase/functions/_shared/schedule";

export function TaskStartFields({ draft, needsDate, onChange }: { draft: EditorDraft; needsDate: boolean; onChange: (patch: Partial<EditorDraft>) => void }) {
  const duration = parseTaskTimeDraft(draft.work, draft.buffer);
  const ready = duration.minutes !== null && !duration.error;
  const end = duration.minutes !== null && !duration.error && draft.start ? deriveScheduleEnd(draft.date || null, draft.start, duration.minutes) : null;
  return <div className="oddk-taskStartFields">
    {needsDate && <label className="oddk-dialogField" htmlFor="edit-plan-date">날짜<input id="edit-plan-date" type="date" min="0001-01-01" max="9999-12-31" value={draft.date} required={Boolean(draft.start)} onChange={event => onChange({ date: event.target.value })} /></label>}
    <div className="oddk-editorTimeGrid">
      <label className="oddk-dialogField" htmlFor="edit-start">시작 시각<input id="edit-start" type="time" step={60} value={draft.start} disabled={!ready} aria-describedby="edit-start-hint" onChange={event => onChange({ start: event.target.value })} /></label>
      <div className="oddk-dialogField"><span>종료 시각</span><output aria-label="자동 계산된 종료 시각" aria-live="polite">{end ? `${end.endDayOffset ? "다음 날 " : ""}${end.endTime}` : "—"}</output></div>
    </div>
    <div className="oddk-taskStartHint"><small id="edit-start-hint">{!ready ? "작업·여유 시간을 입력하면 시작 시각을 정할 수 있어요." : draft.start ? "저장하면 시간표에 바로 반영돼요. 종료 시각에 여유가 포함돼요." : "시작 시각을 정하면 시간표에 표시돼요."}</small>{draft.start && <button type="button" onClick={() => onChange({ start: "" })}>시간대 해제</button>}</div>
  </div>;
}
