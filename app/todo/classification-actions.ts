import type { Plan, Task, Category, Tag } from "../../supabase/functions/_shared/plan.ts";
import { validPlan } from "../../supabase/functions/_shared/plan.ts";
import { normalizeName, normalizeTagName, nameKey } from "../../supabase/functions/_shared/taxonomy.ts";
export type ClassificationFilter = { category: "all" | "none" | `category:${string}`; tags: string[]; search: string };
export function filterClassifiedTasks(tasks: Task[], filter: ClassificationFilter): Task[] {
  const query = nameKey(filter.search);
  return tasks.filter(task => (filter.category === "all" || (filter.category === "none" ? task.categoryId == null : task.categoryId === filter.category.slice(9))) && filter.tags.every(id => (task.tagIds ?? []).includes(id)) && (!query || nameKey(`${task.title} ${task.notes ?? ""}`).includes(query)));
}
function checked(plan: Plan, error: string): Plan { if (!validPlan(plan)) throw new Error(error); return plan; }
export function saveCategory(plan: Plan, category: Category): Plan {
  const entry = { ...category, name: normalizeName(category.name) }, categories = plan.categories ?? [];
  return checked({ ...plan, categories: categories.some(value => value.id === entry.id) ? categories.map(value => value.id === entry.id ? entry : value) : [...categories, entry] }, "카테고리는 이름30자·최대30개이며 같은 이름을 중복할 수 없어요. 색상도 확인해주세요.");
}
export function saveTag(plan: Plan, tag: Tag): Plan {
  const entry = { ...tag, name: normalizeTagName(tag.name) }, tags = plan.tags ?? [];
  return checked({ ...plan, tags: tags.some(value => value.id === entry.id) ? tags.map(value => value.id === entry.id ? entry : value) : [...tags, entry] }, "태그는 이름30자·최대100개이며 같은 이름을 중복할 수 없어요.");
}
export function removeCategory(plan: Plan, id: string): Plan {
  if (!plan.categories?.some(value => value.id === id)) throw new Error("삭제할 카테고리가 없어요. 최신 목록을 확인해주세요.");
  return checked({ ...plan, categories: plan.categories.filter(category => category.id !== id), tasks: plan.tasks.map(task => task.categoryId === id ? { ...task, categoryId: null } : task) }, "카테고리 연결을 해제하지 못했어요. 기존 계획은 유지했어요.");
}
export function removeTag(plan: Plan, id: string): Plan {
  if (!plan.tags?.some(value => value.id === id)) throw new Error("삭제할 태그가 없어요. 최신 목록을 확인해주세요.");
  return checked({ ...plan, tags: plan.tags.filter(tag => tag.id !== id), tasks: plan.tasks.map(task => task.tagIds?.includes(id) ? { ...task, tagIds: task.tagIds.filter(tag => tag !== id) } : task) }, "태그 연결을 해제하지 못했어요. 기존 계획은 유지했어요.");
}
