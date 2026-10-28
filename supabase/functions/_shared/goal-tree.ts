import type { Mandala } from "./plan.ts";
export type GoalGroup = { id: string; title: string; taskIds: string[]; legacyArea?: number; missingTaskIds?: string[] };
export type GoalTree = { goal: string; groups: GoalGroup[] };
export const goalGroupLimit = 32, goalLinkLimit = 5000;
type TaskIdentity = { id: string };
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const groupId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 100 && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
export function validGoalTree(value: unknown, tasks: TaskIdentity[], legacy?: Mandala): value is GoalTree {
  if (!object(value) || typeof value.goal !== "string" || value.goal.length > 100 || !Array.isArray(value.groups) || value.groups.length > goalGroupLimit) return false;
  const taskIds = new Set(tasks.map(task => task.id)), groups = new Set<string>(), legacyAreas = new Set<number>(); let count = 0;
  return value.groups.every(group => {
    if (!object(group) || !groupId(group.id) || groups.has(group.id) || typeof group.title !== "string" || group.title.length > 60 || !Array.isArray(group.taskIds) || group.taskIds.length > goalLinkLimit || group.taskIds.some(id => typeof id !== "string" || !taskIds.has(id)) || new Set(group.taskIds).size !== group.taskIds.length) return false;
    groups.add(group.id); count += group.taskIds.length; if (count > goalLinkLimit) return false;
    if (group.legacyArea !== undefined) {
      if (typeof group.legacyArea !== "number" || !Number.isInteger(group.legacyArea) || group.legacyArea < 0 || group.legacyArea > 7 || legacyAreas.has(group.legacyArea) || !legacy?.areas?.[group.legacyArea]) return false;
      legacyAreas.add(group.legacyArea);
    }
    const active = group.taskIds;
    const missing = group.missingTaskIds === undefined ? [] : group.missingTaskIds;
    const original = typeof group.legacyArea === "number" ? legacy?.areas?.[group.legacyArea]?.taskIds ?? [] : [];
    return Array.isArray(missing) && missing.length <= 8 && new Set(missing).size === missing.length && missing.every(id => typeof id === "string" && id.length > 0 && id.length <= 100 && original.includes(id) && !active.includes(id));
  });
}
// The caller retains the complete original Mandala as an archive before persisting V5.
// Slot positions and duplicate slots stay in that archive, not in the active link list.
export function goalTreeFromMandala(legacy: Mandala | undefined, tasks: TaskIdentity[]): GoalTree {
  if (!legacy) return { goal: "", groups: [] };
  const known = new Set(tasks.map(task => task.id));
  return { goal: legacy.goal, groups: legacy.areas.map((area, index) => {
    const ids = [...new Set(area.taskIds.filter(id => id !== ""))];
    return { id: `legacy-${index}`, title: area.title, legacyArea: index, taskIds: ids.filter(id => known.has(id)), missingTaskIds: ids.filter(id => !known.has(id)) };
  }) };
}
export function addGoalGroup(tree: GoalTree, id: string, title: string, tasks: TaskIdentity[], legacy?: Mandala): GoalTree {
  const next = { ...tree, groups: [...tree.groups, { id, title, taskIds: [] }] };
  if (!validGoalTree(next, tasks, legacy)) throw new Error("세부 목표는 최대32개·이름60자예요. 기존 내용은 유지했어요.");
  return next;
}
export function removeGoalGroup(tree: GoalTree, id: string): GoalTree {
  if (!tree.groups.some(group => group.id === id)) throw new Error("삭제할 세부 목표가 없어요. 최신 목표를 확인해주세요.");
  return { ...tree, groups: tree.groups.filter(group => group.id !== id) };
}
export function linkGoalTask(tree: GoalTree, groupId: string, taskId: string, tasks: TaskIdentity[], legacy?: Mandala): GoalTree {
  if (!tasks.some(task => task.id === taskId) || !tree.groups.some(group => group.id === groupId)) throw new Error("연결할 목표나 할 일이 없어요. 최신 목록을 확인해주세요.");
  const next = { ...tree, groups: tree.groups.map(group => group.id === groupId ? { ...group, taskIds: [...new Set([...group.taskIds, taskId])], missingTaskIds: group.missingTaskIds?.filter(id => id !== taskId) } : group) };
  if (!validGoalTree(next, tasks, legacy)) throw new Error("목표 연결은 전체5000개까지예요. 기존 내용은 유지했어요.");
  return next;
}
export function unlinkGoalTasks(tree: GoalTree, ids: Set<string>): GoalTree {
  return { ...tree, groups: tree.groups.map(group => ({ ...group, taskIds: group.taskIds.filter(id => !ids.has(id)), ...(group.missingTaskIds ? { missingTaskIds: group.missingTaskIds.filter(id => !ids.has(id)) } : {}) })) };
}
// Never truncate an oversized tree to fit the old 8x8 board.
export function goalTreeProjection(tree: GoalTree): Mandala | null {
  if (tree.groups.length > 8 || tree.groups.some(group => group.taskIds.length + (group.missingTaskIds?.length ?? 0) > 8)) return null;
  return { goal: tree.goal, areas: Array.from({ length: 8 }, (_, index) => {
    const group = tree.groups[index], ids = group ? [...group.taskIds, ...(group.missingTaskIds ?? [])] : [];
    return { title: group?.title ?? "", taskIds: [...ids, ...Array<string>(8 - ids.length).fill("")] };
  }) };
}
