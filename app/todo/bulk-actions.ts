import { taskTitleKey } from "./task-identity.ts";
import type { Plan, Task } from "../../supabase/functions/_shared/plan.ts";
import { selectedTaskSummary } from "./task-order.ts";
import { sameValue } from "./json-equality.ts";
import { deletePlanTasks } from "./goal-actions.ts";
export type BulkRequest = { kind: "delete" | "done" | "undone"; plan: Plan; tasks: Task[]; hidden: number; excludedSummaries?: number };
export function previewBulkAction(plan: Plan, selectedIds: string[], visibleIds: string[], kind: BulkRequest["kind"]): BulkRequest {
  const summary = selectedTaskSummary(plan.tasks, selectedIds, visibleIds);
  const tasks = kind === "delete" ? summary.tasks : summary.tasks.filter(task => !task.summaryOnly);
  if (!tasks.length) throw new Error("처리할 실행 업무를 먼저 선택해주세요. 요약은 완료 처리 대상에서 제외해요.");
  return { kind, plan, tasks, hidden: tasks.filter(task => !visibleIds.includes(task.id)).length, excludedSummaries: summary.tasks.length - tasks.length };
}
export function applyBulkAction(current: Plan, request: BulkRequest): Plan {
  if (!sameValue(current, request.plan)) throw new Error("확인하는 동안 계획이 바뀌었어요. 취소 후 최신 대상으로 다시 확인해주세요. 선택은 유지했어요.");
  const ids = new Set(request.tasks.map(task => task.id));
  if (!ids.size || ids.size !== request.tasks.length || request.tasks.some(task => !sameValue(current.tasks.find(value => value.id === task.id), task))) throw new Error("선택 대상이 달라졌어요. 최신 목록을 확인해주세요.");
  if (request.kind === "delete") return deletePlanTasks(current, ids);
  if (request.tasks.some(task => task.summaryOnly)) throw new Error("요약은 완료 처리 대상에서 제외해요. 실행 업무를 다시 확인해주세요.");
  const tasks = current.tasks.map(task => ids.has(task.id) ? { ...task, done: request.kind === "done" } : task);
  const titles = tasks.filter(task => !task.done && !task.summaryOnly).map(taskTitleKey);
  if (request.kind === "undone" && new Set(titles).size !== titles.length) throw new Error("같은 내용의 진행 중인 항목이 있어 완료를 취소할 수 없어요. 선택은 유지했어요.");
  return { ...current, tasks };
}
