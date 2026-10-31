"use client";

import { useState } from "react";
import type { Plan } from "../../supabase/functions/_shared/plan";
import type { EditorDraft } from "./workspace-draft";
import { TaskTagFields } from "./classification-controls";
import { addDraftTag } from "./task-tags";

export function TaskTagEditor({ plan, draft, onChange }: {
  plan: Plan;
  draft: Pick<EditorDraft, "tagIds" | "pendingTags" | "tagInput">;
  onChange: (patch: Partial<EditorDraft>) => void;
}) {
  const [error, setError] = useState("");
  const pending = draft.pendingTags ?? [], selected = draft.tagIds ?? [];
  function add() {
    try { onChange(addDraftTag(plan, draft, draft.tagInput ?? "", () => crypto.randomUUID())); setError(""); }
    catch (error) { setError(error instanceof Error ? error.message : "태그를 추가하지 못했어요."); }
  }
  return <section className="oddk-editorTags" aria-label="할 일 태그">
    <TaskTagFields plan={{ ...plan, tags: [...(plan.tags ?? []), ...pending.filter(tag => !plan.tags?.some(saved => saved.id === tag.id))] }} tagIds={selected} emptyMessage=""
      onChange={({ tagIds }) => { onChange({ tagIds, pendingTags: pending.filter(tag => tagIds.includes(tag.id)) }); setError(""); }} />
    <div className="oddk-inlineTagEntry">
      <label className="oddk-srOnly" htmlFor="edit-new-tag">새 태그 이름</label>
      <span aria-hidden="true">#</span>
      <input id="edit-new-tag" value={draft.tagInput ?? ""} maxLength={120} placeholder="새 태그 입력 후 Enter" aria-describedby="edit-tag-feedback" aria-invalid={Boolean(error)}
        onChange={event => { onChange({ tagInput: event.target.value }); setError(""); }}
        onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); event.stopPropagation(); add(); } }} />
      <button type="button" aria-label="태그 추가" disabled={!draft.tagInput?.trim()} onClick={add}>추가</button>
    </div>
    <p id="edit-tag-feedback" className={error ? "oddk-inlineTagError" : pending.length ? "oddk-inlineTagHint" : "oddk-srOnly"} role={error ? "alert" : "status"}>{error || (pending.length ? "새 태그는 할 일을 저장할 때 함께 추가돼요." : "")}</p>
  </section>;
}
