import type { Mandala, Priority, Task } from "../../supabase/functions/_shared/plan.ts";
import { validMandala, validTaskSnapshot } from "../../supabase/functions/_shared/plan.ts";
import { validTaskClassification, validTags, taskTagLimit } from "../../supabase/functions/_shared/taxonomy.ts";
import type { Tag } from "../../supabase/functions/_shared/taxonomy.ts";
import type { Importance } from "../../supabase/functions/_shared/task-planning.ts";
import type { TaskSort } from "./task-order.ts";
import type { ClassificationFilter } from "./classification-actions.ts";
import type { GoalTree } from "../../supabase/functions/_shared/goal-tree.ts";
import { validGoalSnapshot } from "./goal-draft.ts";
import { validRepeatDraft } from "./repeat-editor-model.ts";
import type { RepeatDraft } from "./repeat-editor-model.ts";
// Retain old menu values so existing drafts remain readable after menu changes.
export type DraftView = "list" | "rhythm" | "mandala" | "alpen" | "stats" | "dashboard" | "review" | "settings";
export type EditorDraft = { base: Task; baseMandala: Mandala; baseGoalTree?: GoalTree; goalLinks?: string[]; goalExpanded?: boolean; splitTitles?: string[]; splitSummary?: boolean; repeat?: RepeatDraft; reminder?: string; title: string; notes?: string; importance?: Importance; dueDate?: string; dueTime?: string; categoryId?: string | null; tagIds?: string[]; pendingTags?: Tag[]; tagInput?: string; work: string; buffer: string; start: string; date: string; timeMode?: "clock" | "duration" | "legacy"; end?: string; endDate?: string; endDay?: string; priority: Priority; done: boolean; links: string[] };
export type WorkspaceDraft = { selectedIds?: string[]; selectionMode?: boolean; sort?: TaskSort; classification?: ClassificationFilter; range?: "day" | "week" | "all"; input: string; view: DraftView; selectedDate: string | null; editingId: string | null; editors: Record<string, EditorDraft>; mandalaDraft: Mandala | null; mandalaBase: Mandala | null };
export const emptyWorkspace: WorkspaceDraft = { range: "day", input: "", view: "list", selectedDate: null, editingId: null, editors: {}, mandalaDraft: null, mandalaBase: null };
const object = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === "object" && !Array.isArray(v));
export function validWorkspace(v: unknown): v is WorkspaceDraft {
  if (object(v) && ((v.selectedIds !== undefined && (!Array.isArray(v.selectedIds) || v.selectedIds.length > 5000 || v.selectedIds.some(id => typeof id !== "string" || !id || id.length > 100) || new Set(v.selectedIds).size !== v.selectedIds.length)) || (v.selectionMode !== undefined && typeof v.selectionMode !== "boolean") || (v.sort !== undefined && (typeof v.sort !== "string" || !["manual", "importance", "deadline"].includes(v.sort))))) return false;
  if (object(v) && v.classification !== undefined && (!object(v.classification) || typeof v.classification.category !== "string" || !/^(all|none|category:.{1,100})$/.test(v.classification.category) || typeof v.classification.search !== "string" || v.classification.search.length > 120 || !Array.isArray(v.classification.tags) || !validTaskClassification({ tagIds: v.classification.tags }))) return false;
  if (!object(v) || (v.range !== undefined && !["day", "week", "all"].includes(String(v.range))) || typeof v.input !== "string" || v.input.length > 2000 || !["list", "rhythm", "mandala", "alpen", "stats", "dashboard", "review", "settings"].includes(String(v.view)) ||
    !(v.selectedDate === null || typeof v.selectedDate === "string") || !(v.editingId === null || typeof v.editingId === "string") || !object(v.editors) || Object.keys(v.editors).length > 5000 ||
    !(v.mandalaDraft === null || validMandala(v.mandalaDraft)) || !(v.mandalaBase === null || validMandala(v.mandalaBase))) return false;
  return Object.entries(v.editors).every(([id, e]) => object(e) && object(e.base) && e.base.id === id &&
    validTaskSnapshot(e.base, e.base.repeatSeriesId !== undefined || e.base.reminderMinutes !== undefined ? 6 : e.base.summaryOnly !== undefined || e.base.parentTaskId !== undefined ? 5 : 2) && validMandala(e.baseMandala) && validTaskClassification(e) &&
    (e.pendingTags === undefined || validTags(e.pendingTags) && e.pendingTags.length <= taskTagLimit) &&
    (e.tagInput === undefined || typeof e.tagInput === "string" && e.tagInput.length <= 120) &&
    (e.splitTitles === undefined || Array.isArray(e.splitTitles) && e.splitTitles.length >= 2 && e.splitTitles.length <= 32 && e.splitTitles.every(title => typeof title === "string" && title.length <= 120)) &&
    (e.goalExpanded === undefined || typeof e.goalExpanded === "boolean") &&
    (e.splitSummary === undefined || typeof e.splitSummary === "boolean") &&
    (e.repeat === undefined || validRepeatDraft(e.repeat)) && (e.reminder === undefined || typeof e.reminder === "string" && e.reminder.length <= 10) &&
    (e.baseGoalTree === undefined || validGoalSnapshot(e.baseGoalTree, e.baseMandala)) &&
    (e.goalLinks === undefined || Array.isArray(e.goalLinks) && e.goalLinks.length <= 32 && new Set(e.goalLinks).size === e.goalLinks.length && e.goalLinks.every(id => typeof id === "string" && id.length > 0 && id.length <= 100)) &&
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

