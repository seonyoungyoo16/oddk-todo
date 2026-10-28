import type { Mandala } from "../../supabase/functions/_shared/plan.ts";
import { validMandala } from "../../supabase/functions/_shared/plan.ts";
import type { GoalTree } from "../../supabase/functions/_shared/goal-tree.ts";
import { validGoalTree } from "../../supabase/functions/_shared/goal-tree.ts";

export type GoalDraft = { base: GoalTree; value: GoalTree; archive?: Mandala };
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));

// A draft is a historical snapshot. A deleted remote task must not erase it.
// Persisting a plan still requires validGoalTree against the current tasks.
export function validGoalSnapshot(value: unknown, archive?: Mandala): value is GoalTree {
  if (!object(value) || !Array.isArray(value.groups) || value.groups.length > 32) return false;
  const ids = new Set<string>();
  for (const group of value.groups) {
    if (!object(group) || !Array.isArray(group.taskIds) || group.taskIds.length > 5000) return false;
    for (const id of group.taskIds) {
      if (typeof id !== "string" || !id) return false;
      ids.add(id);
    }
  }
  return validGoalTree(value, [...ids].map(id => ({ id })), archive);
}

export function validGoalDraft(value: unknown): value is GoalDraft {
  return object(value) && (value.archive === undefined || validMandala(value.archive)) &&
    validGoalSnapshot(value.base, value.archive as Mandala | undefined) &&
    validGoalSnapshot(value.value, value.archive as Mandala | undefined);
}

export function missingGoalDraftTasks(draft: GoalDraft, tasks: Array<{ id: string }>): string[] {
  const known = new Set(tasks.map(task => task.id));
  return [...new Set(draft.value.groups.flatMap(group => group.taskIds).filter(id => !known.has(id)))];
}
