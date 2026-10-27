import { HiOutlineClock } from "react-icons/hi2";
import type { EditorDraft } from "./workspace-draft";
import { endpointWindow, editorMode, parseEditorSchedule } from "./editor-schedule";
import { deriveScheduleEnd } from "../../supabase/functions/_shared/schedule";
import { TaskTimeFields } from "./task-time-fields";
import { parseTaskTimeDraft } from "./task-time";

export function TaskScheduleFields({ draft, onChange }: { draft: EditorDraft; onChange: (patch: Partial<EditorDraft>) => void }) {
  const mode = editorMode(draft), result = parseEditorSchedule(draft), window = endpointWindow(draft);
  const configuring = Boolean(draft.start || draft.end || draft.buffer.trim());
  function changeMode(timeMode: "clock" | "duration") {
    const duration = parseTaskTimeDraft(draft.work, draft.buffer);
    const end = draft.start && duration.minutes !== null ? deriveScheduleEnd(draft.date || null, draft.start, duration.minutes) : null;
    onChange({ timeMode, ...(timeMode === "clock" && !draft.end && end ? { end: end.endTime, endDate: end.endDate ?? "", endDay: String(end.endDayOffset) } : {}), ...(timeMode === "duration" && result.minutes !== null ? { work: String(result.work) } : {}) });
  }
  return <div className="oddk-scheduleFields">
    <div className="oddk-timeMode" role="group" aria-label="시간 입력 방식"><button type="button" aria-pressed={mode === "clock"} onClick={() => changeMode("clock")}>시작·종료</button><button type="button" aria-pressed={mode === "duration"} onClick={() => changeMode("duration")}>소요시간만</button></div>
    {mode === "clock" ? <>
      <div className="oddk-editorTimeGrid"><label className="oddk-dialogField" htmlFor="edit-start">시작<input id="edit-start" type="time" step={60} value={draft.start} onChange={event => onChange({ start: event.target.value })} required={configuring} aria-describedby="edit-schedule-result" /></label><label className="oddk-dialogField" htmlFor="edit-end">종료<input id="edit-end" type="time" step={60} value={draft.end ?? ""} onChange={event => onChange({ end: event.target.value })} required={configuring} aria-describedby="edit-schedule-result" /></label></div>
      <div className="oddk-editorTimeGrid">{draft.date ? <label className="oddk-dialogField" htmlFor="edit-end-date">종료 날짜<input id="edit-end-date" type="date" min="0001-01-01" max="9999-12-31" value={draft.endDate ?? draft.date} onChange={event => onChange({ endDate: event.target.value })} required={configuring} aria-describedby="edit-schedule-result" /></label> : <label className="oddk-dialogField" htmlFor="edit-end-day">종료일<select id="edit-end-day" value={draft.endDay ?? "0"} onChange={event => onChange({ endDay: event.target.value })}><option value="0">같은 날</option><option value="1">다음 날</option></select><small>날짜를 정하면 시간표에 배치돼요.</small></label>}
      <label className="oddk-dialogField" htmlFor="edit-buffer">포함된 여유 시간<span className="oddk-editorNumber"><input id="edit-buffer" type="number" min={1} max={window.ok ? window.minutes - 1 : 239} step={1} disabled={!window.ok} value={draft.buffer} onChange={event => onChange({ buffer: event.target.value })} required={configuring} placeholder="예: 10" aria-describedby="edit-schedule-result" /><span className="oddk-editorUnit" aria-hidden="true">분</span></span></label></div>
    </> : <>
      {mode === "legacy" && <p className="oddk-timeGuide">작성 중이던 시간 설정을 그대로 이어서 입력할 수 있어요.</p>}
      <TaskTimeFields work={draft.work} buffer={draft.buffer} onWorkChange={work => onChange({ work })} onBufferChange={buffer => onChange({ buffer })} />
      {mode === "legacy" && <label className="oddk-dialogField" htmlFor="edit-start">시작 시각<input id="edit-start" type="time" step={60} value={draft.start} onChange={event => onChange({ start: event.target.value })} /></label>}
      {mode === "duration" && <p className="oddk-timeGuide">시각 없이 소요시간만 예상해요. 시작·종료로 전환하면 시간대에 배치할 수 있어요.</p>}
    </>}
    {mode === "clock" && <output id="edit-schedule-result" className="oddk-editorTimeTotal" aria-live="polite"><HiOutlineClock aria-hidden="true" /><span>{result.error || (result.minutes === null ? "시간 설정은 나중에 해도 괜찮아요." : `수행 ${result.minutes}분 = 작업 ${result.work}분 + 여유 ${result.bufferMinutes}분`)}</span></output>}
    {mode === "clock" && !window.ok && <small className="oddk-timeGuide">시작·종료를 정하면 여유를 입력할 수 있어요. 종료 시각에 여유가 포함돼요.</small>}
  </div>;
}
