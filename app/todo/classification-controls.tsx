import { useState } from "react";
import { HiOutlineChevronDown, HiOutlinePencilSquare, HiOutlineTrash, HiOutlineXMark } from "react-icons/hi2";
import type { Plan, Task } from "../../supabase/functions/_shared/plan";
import type { Category, Tag } from "../../supabase/functions/_shared/taxonomy";
import { taskTagLimit } from "../../supabase/functions/_shared/taxonomy";
import { saveCategory, saveTag, removeCategory, removeTag } from "./classification-actions";
import type { ClassificationFilter } from "./classification-actions";
import { emptyClassificationDraft, validClassificationDraft } from "./classification-draft";
import { useLocalDraft, DraftFeedback } from "./use-local-draft";
import { sameValue } from "./json-equality";

export const defaultClassification: ClassificationFilter = { category: "all", tags: [], search: "" };
export function ClassificationBadges({ task, plan, showCategory = true }: { task: Task; plan: Plan; showCategory?: boolean }) {
  const category = showCategory ? plan.categories?.find(value => value.id === task.categoryId) : undefined;
  return <span className="oddk-classificationBadges">{category && <span className="oddk-categoryBadge"><i style={{ backgroundColor: category.color }} aria-hidden="true" />{category.name}</span>}{(task.tagIds ?? []).map(id => <span key={id}>#{plan.tags?.find(tag => tag.id === id)?.name ?? "삭제된 태그"}</span>)}</span>;
}
export function ClassificationFilters({ plan, value, onChange, count, total }: { plan: Plan; value: ClassificationFilter; onChange: (value: ClassificationFilter) => void; count: number; total: number }) {
  const unknownCategory = value.category.startsWith("category:") && !plan.categories?.some(c => `category:${c.id}` === value.category);
  const selectedTags = [...(plan.tags ?? []), ...value.tags.filter(id => !plan.tags?.some(t => t.id === id)).map(id => ({ id, name: "삭제된 태그" }))];
  const changed = value.category !== "all" || value.tags.length > 0 || value.search !== "";
  return <section className="oddk-classificationFilters" aria-label="할 일 분류와 검색">
    <div className="oddk-filterFields"><label><span className="oddk-srOnly">카테고리</span><select value={value.category} onChange={e => onChange({ ...value, category: e.target.value as ClassificationFilter["category"] })}><option value="all">모든 카테고리</option><option value="none">미분류</option>{unknownCategory && <option value={value.category}>삭제된 카테고리</option>}{plan.categories?.map(c => <option key={c.id} value={`category:${c.id}`}>{c.name}</option>)}</select></label><label className="oddk-searchField"><span className="oddk-srOnly">검색</span><input type="search" maxLength={120} value={value.search} placeholder="제목·상세 메모 검색" onChange={e => onChange({ ...value, search: e.target.value })} /></label></div>
    {selectedTags.length > 0 && <fieldset className="oddk-tagOptions"><legend>태그 <small>선택한 태그를 모두 포함</small></legend>{selectedTags.map(tag => <button type="button" key={tag.id} aria-pressed={value.tags.includes(tag.id)} disabled={!value.tags.includes(tag.id) && value.tags.length >= taskTagLimit} onClick={() => onChange({ ...value, tags: value.tags.includes(tag.id) ? value.tags.filter(id => id !== tag.id) : [...value.tags, tag.id] })}>#{tag.name}</button>)}</fieldset>}
    <div className={"oddk-filterSummary" + (changed ? "" : " oddk-srOnly")}><span role="status">이 날짜 범위 {total}개 중 {count}개{changed ? " · 필터 적용 중" : ""}</span>{changed && <button type="button" onClick={() => onChange(defaultClassification)}><HiOutlineXMark aria-hidden="true" />필터 초기화</button>}</div>
    {changed && <small>목록·시간표·분석에 같은 필터를 적용해요. 빈 시간과 충돌은 숨긴 일정을 포함한 하루 전체 기준이에요.</small>}
  </section>;
}
export function TaskClassificationFields({ plan, categoryId, tagIds, onChange }: { plan: Plan; categoryId: string | null; tagIds: string[]; onChange: (patch: { categoryId?: string | null; tagIds?: string[] }) => void }) {
  return <fieldset className="oddk-taskClassification"><legend>분류·태그</legend><label>카테고리<select value={categoryId ?? ""} onChange={e => onChange({ categoryId: e.target.value || null })}><option value="">미분류</option>{categoryId && !plan.categories?.some(c => c.id === categoryId) && <option value={categoryId}>삭제된 카테고리 · 다시 선택해주세요</option>}{plan.categories?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><TaskTagFields plan={plan} tagIds={tagIds} onChange={onChange} /></fieldset>;
}
export function TaskTagFields({ plan, tagIds, onChange, emptyMessage = "환경설정의 ‘분류·태그 관리’에서 태그를 추가할 수 있어요." }: { plan: Plan; tagIds: string[]; onChange: (patch: { tagIds: string[] }) => void; emptyMessage?: string }) {
  const missing = tagIds.filter(id => !plan.tags?.some(tag => tag.id === id));
  return <fieldset className="oddk-tagOptions"><legend>태그 <small>{tagIds.length}/{taskTagLimit}</small></legend>{(plan.tags ?? []).map(tag => <button key={tag.id} type="button" aria-pressed={tagIds.includes(tag.id)} disabled={!tagIds.includes(tag.id) && tagIds.length >= taskTagLimit} onClick={() => onChange({ tagIds: tagIds.includes(tag.id) ? tagIds.filter(id => id !== tag.id) : [...tagIds, tag.id] })}>#{tag.name}</button>)}{missing.map(id => <button key={id} type="button" onClick={() => onChange({ tagIds: tagIds.filter(t => t !== id) })}>삭제된 태그 해제 <HiOutlineXMark aria-hidden="true" /></button>)}{!plan.tags?.length && !missing.length && emptyMessage && <small>{emptyMessage}</small>}</fieldset>;
}
export function ClassificationManager({ plan, onSave, initiallyOpen = false }: { plan: Plan; onSave: (next: Plan, message: string) => boolean; initiallyOpen?: boolean }) {
  const draft = useLocalDraft("classification", emptyClassificationDraft, validClassificationDraft), value = draft.value;
  const [error, setError] = useState("");
  const current = value.id === null ? null : (value.kind === "category" ? plan.categories : plan.tags)?.find(e => e.id === value.id) ?? null;
  const conflict = value.id !== null && !sameValue(current, value.base);
  function edit(entry: Category | Tag, kind: "category" | "tag") {
    if (value.name || value.id) { setError("작성 중인 초안을 먼저 저장하거나 취소해주세요. 입력은 유지했어요."); return; }
    draft.set({ kind, id: entry.id, base: entry, name: entry.name, color: "color" in entry ? entry.color : "#4778c8" }); setError("");
  }
  function remove(id: string, kind: "category" | "tag") {
    try { if (!onSave(kind === "category" ? removeCategory(plan, id) : removeTag(plan, id), kind === "category" ? "카테고리를 삭제했어요. 할 일은 미분류로 남겼어요." : "태그를 삭제했어요. 할 일은 유지했어요.")) setError("삭제를 저장하지 못했어요. 기존 분류와 할 일은 유지했어요."); } catch (e) { setError((e as Error).message); }
  }
  return <details className="oddk-classificationManager" open={initiallyOpen}><summary><HiOutlineChevronDown aria-hidden="true" />분류·태그 관리{(value.name || value.id) && <small>작성 중</small>}</summary><p>카테고리는 할 일당 하나, 태그는 여러 개 연결해요. 분류를 삭제해도 할 일은 남아요.</p>
    <div className="oddk-definitionLists">{(["category", "tag"] as const).map(kind => <section key={kind} aria-label={kind === "category" ? "카테고리 목록" : "태그 목록"}><h3>{kind === "category" ? `카테고리 ${plan.categories?.length ?? 0}/30` : `태그 ${plan.tags?.length ?? 0}/100`}</h3><ul>{(kind === "category" ? plan.categories ?? [] : plan.tags ?? []).map(entry => <li key={entry.id}><span>{"color" in entry && <i style={{ backgroundColor: typeof entry.color === "string" ? entry.color : undefined }} aria-hidden="true" />}{kind === "tag" && "#"}{entry.name}</span><button type="button" aria-label={`${entry.name} ${kind === "tag" ? "태그" : "카테고리"} 수정`} onClick={() => edit(entry, kind)}><HiOutlinePencilSquare aria-hidden="true" /></button><button type="button" aria-label={`${entry.name} ${kind === "tag" ? "태그" : "카테고리"} 삭제`} onClick={() => remove(entry.id, kind)}><HiOutlineTrash aria-hidden="true" /></button></li>)}</ul></section>)}</div>
    <form onSubmit={event => { event.preventDefault(); if (conflict) { setError("편집 중인 분류가 변경되거나 삭제됐어요. 초안을 백업한 뒤 다시 확인해주세요."); return; } try { const id = value.id ?? crypto.randomUUID(); const next = value.kind === "category" ? saveCategory(plan, { id, name: value.name, color: value.color }) : saveTag(plan, { id, name: value.name }); if (onSave(next, "분류를 저장했어요.")) { draft.set(emptyClassificationDraft); setError(""); } else setError("저장하지 못했어요. 입력은 초안으로 남아 있어요."); } catch (e) { setError((e as Error).message); } }}>
      <div className="oddk-filterFields"><label>종류<select disabled={value.id !== null} value={value.kind} onChange={e => { draft.set({ ...value, kind: e.target.value as "category" | "tag" }); setError(""); }}><option value="category">카테고리</option><option value="tag">태그</option></select></label><label className="oddk-searchField">이름<input value={value.name} maxLength={120} required placeholder={value.kind === "category" ? "예: 업무, 개인, 자기계발" : "예: 운동"} onChange={e => { draft.set({ ...value, name: e.target.value }); setError(""); }} /><small>저장할 이름은30자까지</small></label>{value.kind === "category" && <label>색상<input type="color" value={value.color} onChange={e => draft.set({ ...value, color: e.target.value })} /></label>}</div>
      {conflict && <div role="alert" className="oddk-draftConflict"><strong>저장된 분류가 바뀌었어요. 입력은 유지했어요.</strong><button type="button" onClick={() => { draft.download(); draft.set(emptyClassificationDraft); setError(""); }}>초안 백업 후 새로 작성</button>{current && <button type="button" onClick={() => { draft.download(); draft.set({ ...value, base: current }); setError(""); }}>백업 후 내 초안 계속 편집</button>}</div>}{error && <p role="alert" className="oddk-error">{error}</p>}<div className="oddk-availabilityActions"><button type="button" onClick={() => { draft.set(emptyClassificationDraft); setError(""); }}>초안 취소</button><button type="submit" disabled={conflict}>{value.id ? "변경 저장" : "분류 추가"}</button></div><DraftFeedback draft={draft} />
    </form></details>;
}
