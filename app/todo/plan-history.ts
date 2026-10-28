import { taskTitleKey } from "./task-identity.ts";
import { sameValue } from "./json-equality.ts";
import { validPlan, validTaskSnapshot } from "../../supabase/functions/_shared/plan.ts";
import type { Plan, Task } from "../../supabase/functions/_shared/plan.ts";
import { taskToV4 } from "../../supabase/functions/_shared/plan-migration.ts";
import { goalTreeFromMandala } from "../../supabase/functions/_shared/goal-tree.ts";
export type TaskChange = { id: string; before: Task | null; after: Task | null; index: number };
export type PlanUndo = { version: 1; sourceSchema?: number; label: string; tasks: TaskChange[]; fields: Array<{ key: string; before: unknown; after: unknown; beforePresent: boolean; afterPresent: boolean }>; order: { before: string[]; after: string[] } | null };
const equal = sameValue;
export function makeUndo(before: Plan, after: Plan, label: string): PlanUndo | null {
  const a = new Map(before.tasks.map(t => [t.id, t])), b = new Map(after.tasks.map(t => [t.id, t]));
  const tasks = [...new Set([...a.keys(), ...b.keys()])].filter(id => !equal(a.get(id), b.get(id))).map(id => ({ id, before: a.get(id) ?? null, after: b.get(id) ?? null, index: before.tasks.findIndex(t => t.id === id) }));
  const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(key => key !== "tasks" && key !== "schemaVersion" && !equal(before[key as keyof Plan], after[key as keyof Plan])).map(key => ({ key, before: before[key as keyof Plan] ?? null, after: after[key as keyof Plan] ?? null, beforePresent: Object.hasOwn(before, key) && before[key as keyof Plan] !== undefined, afterPresent: Object.hasOwn(after, key) && after[key as keyof Plan] !== undefined }));
  const sameMembers = before.tasks.length === after.tasks.length && before.tasks.every(t => b.has(t.id));
  const order = sameMembers && !equal(before.tasks.map(t => t.id), after.tasks.map(t => t.id)) ? { before: before.tasks.map(t => t.id), after: after.tasks.map(t => t.id) } : null;
  return tasks.length || fields.length || order ? { version: 1, sourceSchema: before.schemaVersion ?? 1, label, tasks, fields, order } : null;
}
export function applyUndo(current: Plan, undo: PlanUndo): Plan {
  if (!validUndo(undo) || ![4, 5].includes(Number(current.schemaVersion)) || !validPlan(current)) throw new Error("실행 취소 기록과 현재 계획을 확인해주세요.");
  const legacyGoalChange = current.schemaVersion === 5 && (undo.sourceSchema ?? 4) < 5 && undo.fields.some(field => field.key === "mandala");
  if (legacyGoalChange && !equal(current.goalTree, goalTreeFromMandala(current.mandala, current.tasks))) throw new Error("새 목표 구조가 이후에 변경됐어요. 이전 만다라트의 실행 취소로 덮지 않도록 원본을 보관해주세요.");
  const tasksBeforeMigration = undo.tasks;
  undo = { ...undo, tasks: undo.tasks.map(change => ({ ...change, before: change.before === null ? null : taskToV4(change.before), after: change.after === null ? null : taskToV4(change.after) })) };
  if (undo.tasks.some((change, index) => (tasksBeforeMigration[index].before !== null && change.before === null) || (tasksBeforeMigration[index].after !== null && change.after === null))) throw new Error("이전 실행 취소 기록의 날짜를 변환할 수 없어요. 원본을 백업한 뒤 확인해주세요.");
  for (const t of undo.tasks) if (!equal(current.tasks.find(v => v.id === t.id) ?? null, t.after)) throw new Error("해당 할 일이 이후에 변경됐어요. 최신 내용을 보호하기 위해 실행 취소를 멈췄어요.");
  for (const field of undo.fields) if ((Object.hasOwn(current, field.key) && current[field.key as keyof Plan] !== undefined) !== field.afterPresent || !equal(current[field.key as keyof Plan] ?? null, field.after)) throw new Error("관련 계획이 이후에 변경됐어요. 최신 내용을 먼저 확인해주세요.");
  if (undo.order && !equal(current.tasks.map(t => t.id), undo.order.after)) throw new Error("목록 순서가 이후에 바뀌었어요. 실행 취소 전에 확인해주세요.");
  let tasks = current.tasks.filter(t => !undo.tasks.some(change => change.id === t.id && change.before === null)).map(t => undo.tasks.find(change => change.id === t.id)?.before ?? t);
  for (const t of undo.tasks.filter(t => t.before && !t.after).sort((a,b) => a.index - b.index)) tasks.splice(Math.min(t.index, tasks.length), 0, t.before!);
  if (undo.order) { const order = new Map(undo.order.before.map((id, i) => [id, i])); tasks = tasks.sort((a,b) => order.get(a.id)! - order.get(b.id)!); }
  const next = { ...current, tasks };
  for (const field of undo.fields) {
    if (!field.beforePresent) delete (next as unknown as Record<string, unknown>)[field.key];
    else (next as unknown as Record<string, unknown>)[field.key] = field.before;
  }
  if (legacyGoalChange) next.goalTree = goalTreeFromMandala(next.mandala, next.tasks);
  const nextIds = new Set(next.tasks.map(t => t.id)), currentIds = new Set(current.tasks.map(t => t.id));
  const currentRefs = new Set(current.mandala?.areas.flatMap(a => a.taskIds) ?? []);
  if (next.mandala?.areas.some(a => a.taskIds.some(id => id && !nextIds.has(id) && (currentIds.has(id) || !currentRefs.has(id))))) throw new Error("목표 연결이 이후에 바뀌었어요. 연결된 할 일을 보호하기 위해 실행 취소를 멈췄어요.");
  if (![4, 5].includes(Number(next.schemaVersion)) || !validPlan(next)) throw new Error("복원할 계획의 형식을 확인해주세요. 새 목표 연결과 업무 관계는 유지했어요.");
  const activeTitles = next.tasks.filter(t => !t.done && !t.summaryOnly).map(taskTitleKey);
  if (new Set(activeTitles).size !== activeTitles.length) throw new Error("같은 내용의 미완료 업무가 있어 복원할 수 없어요.");
  return next;
}
export function validUndo(value: unknown): value is PlanUndo | null {
  if (value === null) return true;
  if (!value || typeof value !== "object") return false;
  const v = value as PlanUndo;
  const task = (t: unknown, id: string) => t === null || Boolean(t && typeof t === "object" && "id" in t && t.id === id && validTaskSnapshot(t, v.sourceSchema === 5 ? 5 : 3));
  if (v.sourceSchema !== undefined && ![1, 2, 3, 4, 5].includes(v.sourceSchema)) return false;
  if (v.version !== 1 || typeof v.label !== "string" || v.label.length > 200 || !Array.isArray(v.tasks) || v.tasks.length > 5000 ||
    !v.tasks.every(t => t && typeof t.id === "string" && Number.isInteger(t.index) && t.index >= -1 && t.index < 5000 && (t.before === null ? t.index === -1 : t.index >= 0) && (t.before !== null || t.after !== null) && task(t.before, t.id) && task(t.after, t.id)) || new Set(v.tasks.map(t => t.id)).size !== v.tasks.length ||
    !Array.isArray(v.fields) || v.fields.length > 100 || !v.fields.every(f => f && typeof f.key === "string" && typeof f.beforePresent === "boolean" && typeof f.afterPresent === "boolean" && !["__proto__", "constructor", "prototype", "tasks", "schemaVersion"].includes(f.key)) || new Set(v.fields.map(f => f.key)).size !== v.fields.length) return false;
  if (v.order === null) return true;
  return Boolean(Array.isArray(v.order?.before) && Array.isArray(v.order?.after) && v.order.before.length <= 5000 && v.order.before.length === v.order.after.length && [...v.order.before, ...v.order.after].every(id => typeof id === "string") && new Set(v.order.before).size === v.order.before.length && new Set(v.order.after).size === v.order.after.length && v.order.before.every(id => v.order!.after.includes(id)));
}
