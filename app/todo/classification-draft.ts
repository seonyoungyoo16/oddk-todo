import type { Category, Tag } from "../../supabase/functions/_shared/taxonomy.ts";
import { validCategories, validTags } from "../../supabase/functions/_shared/taxonomy.ts";
export type ClassificationDraft = { kind: "category" | "tag"; id: string | null; base: Category | Tag | null; name: string; color: string };
export const emptyClassificationDraft: ClassificationDraft = { kind: "category", id: null, base: null, name: "", color: "#4778c8" };
export function validClassificationDraft(v: unknown): v is ClassificationDraft {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const e = v as Record<string, unknown>;
  return (e.kind === "category" || e.kind === "tag") && (e.id === null || typeof e.id === "string" && e.id.length > 0 && e.id.length <= 100) && typeof e.name === "string" && e.name.length <= 120 && typeof e.color === "string" && /^#[0-9a-fA-F]{6}$/.test(e.color) && (e.base === null ? e.id === null : e.kind === "category" ? validCategories([e.base]) && (e.base as Category).id === e.id : validTags([e.base]) && (e.base as Tag).id === e.id);
}
