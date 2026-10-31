import type { Mandala } from "../../supabase/functions/_shared/plan.ts";
import { validMandala } from "../../supabase/functions/_shared/plan.ts";
import type { GoalTree } from "../../supabase/functions/_shared/goal-tree.ts";
import { goalTreeProjection, validGoalTree } from "../../supabase/functions/_shared/goal-tree.ts";

export type GoalDraft = { base: GoalTree; value: GoalTree; archive?: Mandala; board?: Mandala; baseBoard?: Mandala };
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
    (value.board === undefined || validMandala(value.board)) &&
    (value.baseBoard === undefined || validMandala(value.baseBoard)) &&
    validGoalSnapshot(value.base, value.archive as Mandala | undefined) &&
    validGoalSnapshot(value.value, value.archive as Mandala | undefined);
}

// Reuse saved cell positions only while they describe the current goal links.
export function goalBoard(tree: GoalTree, preferred?: Mandala): Mandala | null {
  const projection = goalTreeProjection(tree);
  if (!projection || !preferred || !validMandala(preferred)) return projection;
  const ids = (values: string[]) => [...new Set(values.filter(Boolean))].sort();
  const matches = preferred.goal === tree.goal && preferred.areas.every((area, index) =>
    area.title === projection.areas[index].title &&
    JSON.stringify(ids(area.taskIds)) === JSON.stringify(ids(projection.areas[index].taskIds)));
  return matches ? preferred : projection;
}

export function updateGoalBoard(tree: GoalTree, board: Mandala): GoalTree {
  if (!validMandala(board) || !goalTreeProjection(tree)) throw new Error("8×8 범위를 넘는 기존 목표는 그대로 보관돼요.");
  const usedIds = new Set(tree.groups.map(group => group.id));
  return { goal: board.goal, groups: board.areas.map((area, index) => {
    let group = tree.groups[index];
    if (!group) {
      let id = `mandala-${index}`;
      while (usedIds.has(id)) id += "-new";
      usedIds.add(id);
      group = { id, title: "", taskIds: [] };
    }
    const missing = new Set(group.missingTaskIds ?? []);
    const ids = [...new Set(area.taskIds.filter(Boolean))];
    return { ...group, title: area.title, taskIds: ids.filter(id => !missing.has(id)),
      ...(group.missingTaskIds ? { missingTaskIds: ids.filter(id => missing.has(id)) } : {}) };
  }) };
}

export function missingGoalDraftTasks(draft: GoalDraft, tasks: Array<{ id: string }>): string[] {
  const known = new Set(tasks.map(task => task.id));
  return [...new Set(draft.value.groups.flatMap(group => group.taskIds).filter(id => !known.has(id)))];
}
