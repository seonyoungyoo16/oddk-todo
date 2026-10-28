export type Tag = { id: string; name: string };
export type Category = Tag & { color: string };
export type TaskClassification = { categoryId?: string | null; tagIds?: string[] };
export const categoryLimit = 30, tagLimit = 100, taskTagLimit = 10;
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const id = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 100 && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
export const normalizeName = (name: string) => name.normalize("NFC").trim().replace(/\s+/g, " ");
export const normalizeTagName = (name: string) => normalizeName(normalizeName(name).replace(/^#+/, ""));
export const nameKey = (name: string) => normalizeName(name).toLocaleLowerCase("ko-KR");
function validDefinitions(value: unknown, limit: number, categories: boolean): boolean {
  if (!Array.isArray(value) || value.length > limit) return false;
  const ids = new Set<string>(), names = new Set<string>();
  return value.every(entry => {
    if (!object(entry) || !id(entry.id) || ids.has(entry.id) || typeof entry.name !== "string" || entry.name.length < 1 || entry.name.length > 30 || /[\u0000-\u001f\u007f]/.test(entry.name) || (categories ? normalizeName(entry.name) : normalizeTagName(entry.name)) !== entry.name || names.has(nameKey(entry.name)) || (categories && (typeof entry.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(entry.color)))) return false;
    ids.add(entry.id); names.add(nameKey(entry.name)); return true;
  });
}
export const validCategories = (value: unknown): value is Category[] => validDefinitions(value, categoryLimit, true);
export const validTags = (value: unknown): value is Tag[] => validDefinitions(value, tagLimit, false);
export function validTaskClassification(value: Record<string, unknown>): boolean {
  return (value.categoryId === undefined || value.categoryId === null || id(value.categoryId)) && (value.tagIds === undefined || (Array.isArray(value.tagIds) && value.tagIds.length <= taskTagLimit && value.tagIds.every(id) && new Set(value.tagIds).size === value.tagIds.length));
}
export function validTaxonomyReferences(tasks: TaskClassification[], categories: Category[] = [], tags: Tag[] = []): boolean {
  const categoryIds = new Set(categories.map(category => category.id)), tagIds = new Set(tags.map(tag => tag.id));
  return tasks.every(task => (task.categoryId == null || categoryIds.has(task.categoryId)) && (task.tagIds ?? []).every(tag => tagIds.has(tag)));
}
