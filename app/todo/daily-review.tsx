"use client";
import { useState } from "react";
import { isPlanDate } from "../../supabase/functions/_shared/plan";
import { editReviewDraft, hasReviewConflict } from "./planning-actions";
import { useLocalDraft, DraftFeedback } from "./use-local-draft";
import type { ReviewDraft } from "./planning-actions";

type Props = {
  compact?: boolean;
  date: string; reviews: Record<string, string>; legacy: string;
  onSave: (date: string, text: string, expected: string, overwrite: boolean) => boolean;
  onMoveLegacy: (date: string, expected: string) => boolean;
  onUseSaved: (date: string, text: string) => boolean;
  onBackup: () => void;
};
export function DailyReview({ compact = false, date, reviews, legacy, onSave, onMoveLegacy, onUseSaved, onBackup }: Props) {
  const local = useLocalDraft<Record<string, ReviewDraft>>("reviews", {}, validReviewDrafts);
  const drafts = local.value, setDrafts = local.set;
  const [message, setMessage] = useState({ date: "", text: "" });
  const saved = reviews[date] ?? "";
  const draft = drafts[date];
  const note = draft?.text ?? saved;
  const dirty = note !== saved;
  const conflict = hasReviewConflict(draft, saved);
  const validDate = isPlanDate(date);
  function commit(overwrite = false) {
    const expected = overwrite ? saved : draft?.base ?? saved;
    if (!onSave(date, note, expected, overwrite)) { setMessage({ date, text: "저장하지 못했어요. 초안은 유지돼요. 다시 시도해주세요." }); return; }
    setDrafts((current) => { const next = { ...current }; delete next[date]; return next; });
    setMessage({ date, text: `${date} 점검을 저장했어요.` });
  }
  return <section className="oddk-dailyReview" aria-label="날짜별 하루 점검"><DraftFeedback draft={local} />
    <form className="oddk-review" onSubmit={(event) => { event.preventDefault(); if (!conflict && validDate) commit(); }}>
      <label htmlFor="daily-review"><span className={compact ? "oddk-srOnly" : undefined}>{!compact && <span className="oddk-step">N</span>}{validDate ? `${date} 하루 점검` : "계획 날짜를 먼저 선택해주세요"}</span>
        <textarea id="daily-review" value={note} disabled={!validDate} maxLength={2000} placeholder={compact ? "오늘 잘된 점과\n내일 조정할 점을 적어보세요." : "끝낸 일, 막힌 이유, 다음에 이어 할 일을 적어보세요."} onChange={(event) => { const text = event.target.value; setDrafts((current) => ({ ...current, [date]: editReviewDraft(current[date], saved, text) })); setMessage({ date, text: "" }); }} />
      </label>
      {conflict && <div className="oddk-reviewConflict" role="alert"><strong>저장된 점검이 바뀌었어요. 내 초안은 유지돼요.</strong><p>현재 저장된 내용</p><blockquote>{saved || "비어 있음"}</blockquote><button type="button" onClick={() => { if (!onUseSaved(date, note)) { setMessage({ date, text: "초안을 백업하지 못했어요. 입력은 유지돼요." }); return; } setDrafts((current) => ({ ...current, [date]: { text: saved, base: saved } })); setMessage({ date, text: "초안을 백업하고 저장된 내용을 불러왔어요." }); }}>초안 보관 후 저장본 사용</button><button type="button" onClick={() => commit(true)}>내 초안으로 저장</button><small>선택하지 않은 내용도 별도 백업해요.</small></div>}
      <button className={compact ? undefined : "oddk-primary"} type="submit" disabled={!validDate || !dirty || conflict}>점검 저장</button>{!compact && <button type="button" onClick={() => { try { onBackup(); } catch (error) { setMessage({ date, text: (error as Error).message }); } }}>최근 보관 백업 받기</button>}<span role="status">{(message.date === date && message.text) || (dirty ? "이 날짜의 미저장 초안" : "")}</span>
    </form>
    {legacy.trim() && <details className="oddk-legacyReview"><summary>이전 점검 · 날짜 미지정</summary><p>날짜를 지정해 옮기기 전까지 원문을 따로 보관해요.</p><blockquote>{legacy}</blockquote><button type="button" disabled={!validDate || Boolean(saved) || dirty} onClick={() => { setMessage({ date, text: onMoveLegacy(date, legacy) ? `${date}로 이전 점검을 옮겼어요.` : "옮기지 못했어요. 내용은 그대로 남아 있어요." }); }}>{validDate ? `${date}로 옮기기` : "날짜를 먼저 선택해주세요"}</button>{(saved || dirty) && <small>점검과 초안이 없는 날짜를 선택해주세요. 기존 내용은 덮어쓰지 않아요.</small>}</details>}
  </section>;
}

function validReviewDrafts(value: unknown): value is Record<string, ReviewDraft> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length <= 5000 && Object.entries(value).every(([date, d]) => isPlanDate(date) && d && typeof d.text === "string" && d.text.length <= 2000 && typeof d.base === "string" && d.base.length <= 2000));
}
