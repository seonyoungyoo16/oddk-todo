import type { Plan } from "../../supabase/functions/_shared/plan.ts";
import type { Tag } from "../../supabase/functions/_shared/taxonomy.ts";
import { nameKey, normalizeTagName, tagLimit, taskTagLimit, validTags } from "../../supabase/functions/_shared/taxonomy.ts";

export type TaskTagsDraft = { tagIds?: string[]; pendingTags?: Tag[]; tagInput?: string };

export function addDraftTag(plan: Plan, draft: TaskTagsDraft, input: string, makeId: () => string) {
  const name = normalizeTagName(input);
  if (!validTags([{ id: "tag-name-check", name }])) throw new Error("태그 이름을 1~30자로 입력해주세요.");
  const pendingTags = draft.pendingTags ?? [], tagIds = draft.tagIds ?? [];
  const known = [...(plan.tags ?? []), ...pendingTags].find(tag => nameKey(tag.name) === nameKey(name));
  if (known && tagIds.includes(known.id)) return { tagIds, pendingTags, tagInput: "" };
  if (tagIds.length >= taskTagLimit) throw new Error(`할 일에는 태그를 ${taskTagLimit}개까지 연결할 수 있어요.`);
  if (known) return { tagIds: [...tagIds, known.id], pendingTags, tagInput: "" };
  if ((plan.tags?.length ?? 0) + pendingTags.length >= tagLimit) throw new Error(`태그는 최대 ${tagLimit}개까지 만들 수 있어요. 기존 태그를 선택해주세요.`);
  const tag = { id: makeId(), name };
  if (!validTags([tag]) || [...(plan.tags ?? []), ...pendingTags].some(item => item.id === tag.id)) throw new Error("태그를 만들지 못했어요. 다시 추가해주세요.");
  return { tagIds: [...tagIds, tag.id], pendingTags: [...pendingTags, tag], tagInput: "" };
}

// New definitions and task links are committed together by the editor's save.
// A tag created on another device under the same name reuses that saved ID.
export function prepareTaskTags(plan: Plan, draft: TaskTagsDraft): { plan: Plan; tagIds: string[] } {
  const pending = draft.pendingTags ?? [], selected = draft.tagIds ?? [];
  if (!validTags(pending)) throw new Error("추가할 태그 이름을 확인해주세요.");
  const tags = [...(plan.tags ?? [])], remapped = new Map<string, string>();
  for (const tag of pending.filter(value => selected.includes(value.id))) {
    const existing = tags.find(value => nameKey(value.name) === nameKey(tag.name));
    if (existing) { remapped.set(tag.id, existing.id); continue; }
    if (tags.some(value => value.id === tag.id)) throw new Error("태그 정보가 바뀌었어요. 새 태그를 다시 추가해주세요.");
    tags.push(tag);
  }
  const tagIds = [...new Set(selected.map(id => remapped.get(id) ?? id))];
  if (!validTags(tags)) throw new Error(`태그는 이름 30자, 최대 ${tagLimit}개까지 만들 수 있어요.`);
  if (tagIds.length > taskTagLimit) throw new Error(`할 일에는 태그를 ${taskTagLimit}개까지 연결할 수 있어요.`);
  return { plan: pending.length ? { ...plan, tags } : plan, tagIds };
}
