import type { Mandala, Priority, Task } from "../../supabase/functions/_shared/plan.ts";
import { validMandala, validPlan } from "../../supabase/functions/_shared/plan.ts";
export type DraftView = "list" | "rhythm" | "mandala" | "alpen" | "stats";
export type EditorDraft = { base: Task; baseMandala: Mandala; title: string; notes?: string; work: string; buffer: string; start: string; date: string; timeMode?: "clock" | "duration" | "legacy"; end?: string; endDate?: string; endDay?: string; priority: Priority; done: boolean; links: string[] };
export type WorkspaceDraft = { range?: "day" | "week" | "all"; input: string; view: DraftView; selectedDate: string | null; editingId: string | null; editors: Record<string, EditorDraft>; mandalaDraft: Mandala | null; mandalaBase: Mandala | null };
export const emptyWorkspace: WorkspaceDraft = { range: "day", input: "", view: "list", selectedDate: null, editingId: null, editors: {}, mandalaDraft: null, mandalaBase: null };
const object = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === "object" && !Array.isArray(v));
export function validWorkspace(v: unknown): v is WorkspaceDraft {
  if (!object(v) || (v.range !== undefined && !["day", "week", "all"].includes(String(v.range))) || typeof v.input !== "string" || v.input.length > 120 || !["list", "rhythm", "mandala", "alpen", "stats"].includes(String(v.view)) ||
    !(v.selectedDate === null || typeof v.selectedDate === "string") || !(v.editingId === null || typeof v.editingId === "string") || !object(v.editors) || Object.keys(v.editors).length > 5000 ||
    !(v.mandalaDraft === null || validMandala(v.mandalaDraft)) || !(v.mandalaBase === null || validMandala(v.mandalaBase))) return false;
  return Object.entries(v.editors).every(([id, e]) => object(e) && object(e.base) && e.base.id === id &&
    validPlan({ schemaVersion: 2, start: "09:00", tasks: [e.base], reviewsByDate: {} }) && validMandala(e.baseMandala) &&
    ["title", "work", "buffer", "start", "date"].every(k => typeof e[k] === "string" && e[k].length <= 120) &&
    ["end", "endDate", "endDay"].every(k => e[k] === undefined || typeof e[k] === "string" && e[k].length <= 120) &&
    (e.timeMode === undefined || ["clock", "duration", "legacy"].includes(String(e.timeMode))) &&
    (e.notes === undefined || (typeof e.notes === "string" && e.notes.length <= 2000)) && ["high", "normal", "low"].includes(String(e.priority)) && typeof e.done === "boolean" && Array.isArray(e.links) && e.links.length <= 64 && e.links.every(l => typeof l === "string" && /^[0-7]:[0-7]$/.test(l)));
}
export function withoutEditor(workspace: WorkspaceDraft, id: string): WorkspaceDraft {
  const editors = { ...workspace.editors }; delete editors[id];
  return { ...workspace, editors, editingId: workspace.editingId === id ? null : workspace.editingId };
}

