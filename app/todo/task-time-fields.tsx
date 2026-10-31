import { HiOutlineClock } from "react-icons/hi2";
import { parseTaskTimeDraft } from "./task-time";

type TaskTimeFieldsProps = {
  work: string;
  buffer: string;
  onWorkChange: (value: string) => void;
  onBufferChange: (value: string) => void;
};

export function TaskTimeFields({
  work,
  buffer,
  onWorkChange,
  onBufferChange,
}: TaskTimeFieldsProps) {
  const draft = parseTaskTimeDraft(work, buffer);
  const issue = work.trim() && buffer.trim() ? draft.error : "";
  const configuring = Boolean(work.trim() || buffer.trim());

  return (
    <>
      <div className="oddk-editorTimeGrid">
        <label className="oddk-dialogField" htmlFor="edit-work">
          작업 시간
          <span className="oddk-editorNumber">
            <input
              id="edit-work"
              type="number"
              min={1}
              max={239}
              step={1}
              value={work}
              required={configuring}
              placeholder="예: 25"
              aria-label="작업 시간"
              aria-describedby="edit-time-total edit-time-issue"
              aria-invalid={Boolean(issue)}
              onChange={(event) => { onWorkChange(event.target.value); if (!event.target.value.trim()) onBufferChange(""); }}
            />
            <span className="oddk-editorUnit" aria-hidden="true">
              분
            </span>
          </span>
        </label>
        <label className="oddk-dialogField" htmlFor="edit-buffer">
          여유 시간 (휴식 포함)
          <span className="oddk-editorNumber">
            <input
              id="edit-buffer"
              type="number"
              disabled={!work.trim() || !Number.isInteger(Number(work)) || Number(work) < 1 || Number(work) > 239}
              min={1}
              max={239}
              step={1}
              value={buffer}
              required={configuring}
              placeholder="예: 5"
              aria-label="여유 시간"
              aria-describedby="edit-time-total edit-time-issue"
              aria-invalid={Boolean(issue)}
              onChange={(event) => onBufferChange(event.target.value)}
            />
            <span className="oddk-editorUnit" aria-hidden="true">
              분
            </span>
          </span>
        </label>
      </div>
      <output
        id="edit-time-total"
        className="oddk-editorTimeTotal"
        htmlFor="edit-work edit-buffer"
        data-empty={draft.minutes === null}
        aria-live="polite"
      >
        <HiOutlineClock aria-hidden="true" />
        <span>
          {draft.minutes === null
            ? "작업 시간과 여유 시간을 입력해주세요."
            : `총 ${draft.minutes}분 · 작업 ${Number(work)}분 + 여유 ${Number(buffer)}분`}
        </span>
      </output>
      <p
        id="edit-time-issue"
        className={issue ? "oddk-timeGuideError" : "oddk-srOnly"}
        role="status"
      >
        {issue}
      </p>
    </>
  );
}
