import { useState } from "react";
import { HiOutlineChevronDown, HiOutlinePencilSquare, HiOutlineTrash, HiOutlineXMark } from "react-icons/hi2";
import type { Plan, Task } from "../../supabase/functions/_shared/plan";
import type { Tag } from "../../supabase/functions/_shared/taxonomy";
import { taskTagLimit, normalizeTagName } from "../../supabase/functions/_shared/taxonomy";
import { saveTag, removeTag } from "./classification-actions";
import type { ClassificationFilter } from "./classification-actions";
import { emptyClassificationDraft, validClassificationDraft } from "./classification-draft";
import { useLocalDraft, DraftFeedback } from "./use-local-draft";
import { sameValue } from "./json-equality";

const emptyTagDraft = { ...emptyClassificationDraft, kind: "tag" as const };
const validTagDraft = (value: unknown): value is typeof emptyClassificationDraft => validClassificationDraft(value) && value.kind === "tag";

export const defaultClassification: ClassificationFilter = { category: "all", tags: [], search: "", status: "all" };
export function ClassificationBadges({ task, plan }: { task: Task; plan: Plan; showCategory?: boolean }) {
  return <span className="oddk-classificationBadges">{(task.tagIds ?? []).map(id => <span key={id}>#{plan.tags?.find(tag => tag.id === id)?.name ?? "삭제된 태그"}</span>)}</span>;
}
export function TaskClassificationFields({ plan, tagIds, onChange }: { plan: Plan; categoryId: string | null; tagIds: string[]; onChange: (patch: { categoryId?: string | null; tagIds?: string[] }) => void }) {
  return <TaskTagFields plan={plan} tagIds={tagIds} onChange={onChange} />;
}
export function TaskTagFields({ plan, tagIds, onChange, emptyMessage = "환경설정의 ‘태그 관리’에서 태그를 추가할 수 있어요." }: { plan: Plan; tagIds: string[]; onChange: (patch: { tagIds: string[] }) => void; emptyMessage?: string }) {
  const missing = tagIds.filter(id => !plan.tags?.some(tag => tag.id === id));
  return <fieldset className="oddk-tagOptions"><legend>태그 <small>{tagIds.length}/{taskTagLimit}</small></legend>{(plan.tags ?? []).map(tag => <button key={tag.id} type="button" aria-pressed={tagIds.includes(tag.id)} disabled={!tagIds.includes(tag.id) && tagIds.length >= taskTagLimit} onClick={() => onChange({ tagIds: tagIds.includes(tag.id) ? tagIds.filter(id => id !== tag.id) : [...tagIds, tag.id] })}>#{tag.name}</button>)}{missing.map(id => <button key={id} type="button" onClick={() => onChange({ tagIds: tagIds.filter(t => t !== id) })}>삭제된 태그 해제 <HiOutlineXMark aria-hidden="true" /></button>)}{!plan.tags?.length && !missing.length && emptyMessage && <small>{emptyMessage}</small>}</fieldset>;
}
export function ClassificationManager({ plan, onSave, initiallyOpen = false }: { plan: Plan; onSave: (next: Plan, message: string) => boolean; initiallyOpen?: boolean }) {
  // Separate slot preserves any legacy category draft byte-for-byte.
  const draft = useLocalDraft("tag-management", emptyTagDraft, validTagDraft), value = draft.value;
  const [error, setError] = useState("");
  const current = value.id === null ? null : plan.tags?.find(e => e.id === value.id) ?? null;
  const conflict = value.id !== null && !sameValue(current, value.base);
  function edit(entry: Tag) {
    if (value.name || value.id) { setError("작성 중인 내용을 먼저 저장해주세요. 입력은 유지했어요."); return; }
    draft.set({ kind: "tag", id: entry.id, base: entry, name: entry.name, color: "#4778c8" }); setError("");
  }
  function remove(id: string) {
    try { if (!onSave(removeTag(plan, id), "태그를 삭제했어요. 할 일은 유지했어요.")) setError("삭제를 저장하지 못했어요. 기존 태그와 할 일은 유지했어요."); } catch (e) { setError((e as Error).message); }
  }
  return <details className="oddk-classificationManager" open={initiallyOpen}><summary><HiOutlineChevronDown aria-hidden="true" />태그 관리{(value.name || value.id) && <small>작성 중</small>}</summary>
    <div className="oddk-definitionLists oddk-tagOnlyLists"><section aria-label="태그 목록"><header className="oddk-definitionHeading"><h3>태그</h3><small className="oddk-definitionLimit">{plan.tags?.length ?? 0}/100</small></header><ul>{(plan.tags ?? []).map(entry => <li key={entry.id}><span>#{entry.name}</span><button type="button" aria-label={`${entry.name} 태그 수정`} onClick={() => edit(entry)}><HiOutlinePencilSquare aria-hidden="true" /></button><button type="button" aria-label={`${entry.name} 태그 삭제`} onClick={() => remove(entry.id)}><HiOutlineTrash aria-hidden="true" /></button></li>)}</ul></section></div>
    <form onSubmit={event => { event.preventDefault(); if (conflict) { setError("편집 중인 태그가 변경되거나 삭제됐어요. 초안을 백업한 뒤 다시 확인해주세요."); return; } try { const id = value.id ?? crypto.randomUUID(); const next = saveTag(plan, { id, name: value.name }); if (onSave(next, "태그를 저장했어요.")) { draft.set({ ...emptyClassificationDraft, kind: "tag" }); setError(""); } else setError("저장하지 못했어요. 입력은 초안으로 남아 있어요."); } catch (e) { setError((e as Error).message); } }}>
      <div className="oddk-filterFields"><label className="oddk-searchField">태그 이름<input value={value.name} maxLength={120} required placeholder="예: 운동" onChange={e => { draft.set({ ...value, name: e.target.value }); setError(""); }} /><small role="status" aria-live="polite" aria-atomic="true">{normalizeTagName(value.name).length}/30</small></label></div>
      {conflict && <div role="alert" className="oddk-draftConflict"><strong>저장된 태그가 바뀌었어요. 입력은 유지했어요.</strong><button type="button" onClick={() => { draft.download(); draft.set(emptyTagDraft); setError(""); }}>초안 백업 후 새로 작성</button>{current && <button type="button" onClick={() => { draft.download(); draft.set({ ...value, base: current }); setError(""); }}>백업 후 내 초안 계속 편집</button>}</div>}{error && <p role="alert" className="oddk-error">{error}</p>}<div className="oddk-availabilityActions"><button type="submit" disabled={conflict}>{value.id ? "태그 변경 저장" : "태그 추가"}</button></div><DraftFeedback draft={draft} />
    </form></details>;
}
