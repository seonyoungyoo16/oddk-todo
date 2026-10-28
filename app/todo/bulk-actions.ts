import type { Plan, Task } from "../../supabase/functions/_shared/plan.ts";
import { selectedTaskSummary } from "./task-order.ts";
import { sameValue } from "./json-equality.ts";
export type BulkRequest = { kind: "delete" | "done" | "undone"; plan: Plan; tasks: Task[]; hidden: number };
export function previewBulkAction(plan: Plan, selectedIds: string[], visibleIds: string[], kind: BulkRequest["kind"]): BulkRequest {
  const summary = selectedTaskSummary(plan.tasks, selectedIds, visibleIds);
  if (!summary.tasks.length) throw new Error("처리할 할 일을 먼저 선택해주세요.");
  return { kind, plan, tasks: summary.tasks, hidden: summary.hidden };
}
export function applyBulkAction(current: Plan, request: BulkRequest): Plan {
  if (!sameValue(current, request.plan)) throw new Error("확인하는 동안 계획이 바뀌었어요. 취소 후 최신 대상으로 다시 확인해주세요. 선택은 유지했어요.");
  const ids = new Set(request.tasks.map(task => task.id));
  if (!ids.size || ids.size !== request.tasks.length || request.tasks.some(task => !sameValue(current.tasks.find(value => value.id === task.id), task))) throw new Error("선택 대상이 달라졌어요. 최신 목록을 확인해주세요.");
  if (request.kind === "delete") return { ...current, tasks: current.tasks.filter(task => !ids.has(task.id)), ...(current.mandala ? { mandala: { ...current.mandala, areas: current.mandala.areas.map(area => ({ ...area, taskIds: area.taskIds.map(id => ids.has(id) ? "" : id) })) } } : {}) };
  const tasks = current.tasks.map(task => ids.has(task.id) ? { ...task, done: request.kind === "done" } : task);
  const titles = tasks.filter(task => !task.done).map(task => task.title.toLocaleLowerCase());
  if (request.kind === "undone" && new Set(titles).size !== titles.length) throw new Error("같은 내용의 진행 중인 항목이 있어 완료를 취소할 수 없어요. 선택은 유지했어요.");
  return { ...current, tasks };
}
