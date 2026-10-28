import type { Mandala, Priority, Task } from "../../supabase/functions/_shared/plan.ts";
import { validMandala, validTaskSnapshot } from "../../supabase/functions/_shared/plan.ts";
import { validTaskClassification } from "../../supabase/functions/_shared/taxonomy.ts";
import type { Importance } from "../../supabase/functions/_shared/task-planning.ts";
import type { TaskSort } from "./task-order.ts";
import type { ClassificationFilter } from "./classification-actions.ts";
export type DraftView = "list" | "rhythm" | "mandala" | "alpen" | "stats";
export type EditorDraft = { base: Task; baseMandala: Mandala; title: string; notes?: string; importance?: Importance; dueDate?: string; dueTime?: string; categoryId?: string | null; tagIds?: string[]; work: string; buffer: string; start: string; date: string; timeMode?: "clock" | "duration" | "legacy"; end?: string; endDate?: string; endDay?: string; priority: Priority; done: boolean; links: string[] };
export type WorkspaceDraft = { selectedIds?: string[]; selectionMode?: boolean; sort?: TaskSort; classification?: ClassificationFilter; range?: "day" | "week" | "all"; input: string; view: DraftView; selectedDate: string | null; editingId: string | null; editors: Record<string, EditorDraft>; mandalaDraft: Mandala | null; mandalaBase: Mandala | null };
export const emptyWorkspace: WorkspaceDraft = { range: "day", input: "", view: "list", selectedDate: null, editingId: null, editors: {}, mandalaDraft: null, mandalaBase: null };
const object = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === "object" && !Array.isArray(v));
export function validWorkspace(v: unknown): v is WorkspaceDraft {
  if (object(v) && ((v.selectedIds !== undefined && (!Array.isArray(v.selectedIds) || v.selectedIds.length > 5000 || v.selectedIds.some(id => typeof id !== "string" || !id || id.length > 100) || new Set(v.selectedIds).size !== v.selectedIds.length)) || (v.selectionMode !== undefined && typeof v.selectionMode !== "boolean") || (v.sort !== undefined && (typeof v.sort !== "string" || !["manual", "importance", "deadline"].includes(v.sort))))) return false;
  if (object(v) && v.classification !== undefined && (!object(v.classification) || typeof v.classification.category !== "string" || !/^(all|none|category:.{1,100})$/.test(v.classification.category) || typeof v.classification.search !== "string" || v.classification.search.length > 120 || !Array.isArray(v.classification.tags) || !validTaskClassification({ tagIds: v.classification.tags }))) return false;
  if (!object(v) || (v.range !== undefined && !["day", "week", "all"].includes(String(v.range))) || typeof v.input !== "string" || v.input.length > 120 || !["list", "rhythm", "mandala", "alpen", "stats"].includes(String(v.view)) ||
    !(v.selectedDate === null || typeof v.selectedDate === "string") || !(v.editingId === null || typeof v.editingId === "string") || !object(v.editors) || Object.keys(v.editors).length > 5000 ||
    !(v.mandalaDraft === null || validMandala(v.mandalaDraft)) || !(v.mandalaBase === null || validMandala(v.mandalaBase))) return false;
  return Object.entries(v.editors).every(([id, e]) => object(e) && object(e.base) && e.base.id === id &&
    validTaskSnapshot(e.base, e.base.summaryOnly !== undefined || e.base.parentTaskId !== undefined ? 5 : 2) && validMandala(e.baseMandala) && validTaskClassification(e) &&
    ["title", "work", "buffer", "start", "date"].every(k => typeof e[k] === "string" && e[k].length <= 120) &&
    ["end", "endDate", "endDay", "dueDate", "dueTime"].every(k => e[k] === undefined || typeof e[k] === "string" && e[k].length <= 120) &&
    (e.timeMode === undefined || ["clock", "duration", "legacy"].includes(String(e.timeMode))) &&
    (e.importance === undefined || typeof e.importance === "string" && ["high", "normal", "low"].includes(e.importance)) &&
    (e.notes === undefined || (typeof e.notes === "string" && e.notes.length <= 2000)) && ["high", "normal", "low"].includes(String(e.priority)) && typeof e.done === "boolean" && Array.isArray(e.links) && e.links.length <= 64 && e.links.every(l => typeof l === "string" && /^[0-7]:[0-7]$/.test(l)));
}
export function withoutEditor(workspace: WorkspaceDraft, id: string): WorkspaceDraft {
  const editors = { ...workspace.editors }; delete editors[id];
  return { ...workspace, editors, editingId: workspace.editingId === id ? null : workspace.editingId };
}

