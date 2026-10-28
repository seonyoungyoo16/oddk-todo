import { taskTitleKey } from "./task-identity.ts";
import { validPlan } from "../../supabase/functions/_shared/plan.ts";
import type { Plan, Task } from "../../supabase/functions/_shared/plan.ts";
import { unlinkGoalTasks } from "../../supabase/functions/_shared/goal-tree.ts";
import type { GoalTree } from "../../supabase/functions/_shared/goal-tree.ts";
import { detachRepeatOccurrence, removeRepeatTasks } from "../../supabase/functions/_shared/repeat-actions.ts";
export function saveGoalTree(plan: Plan, goalTree: GoalTree): Plan {
  const next = { ...plan, goalTree, ...(plan.recurrences ? { recurrences: plan.recurrences.map(series => ({ ...series, goalGroupIds: series.goalGroupIds.filter(id => goalTree.groups.some(group => group.id === id)) })) } : {}) };
  if (!validPlan(next)) throw new Error("목표 이름·32개 세부 목표·전체5000개 연결과 최신 할 일을 확인해주세요. 입력은 유지했어요.");
  return next;
}
export function setTaskGoalLinks(plan: Plan, taskId: string, groupIds: string[]): Plan {
  if (!plan.tasks.some(task => task.id === taskId) || new Set(groupIds).size !== groupIds.length || groupIds.some(id => !plan.goalTree.groups.some(group => group.id === id))) throw new Error("연결할 목표나 할 일이 바뀌었어요. 최신 내용을 확인해주세요.");
  return saveGoalTree(plan, { ...plan.goalTree, groups: plan.goalTree.groups.map(group => ({ ...group, taskIds: groupIds.includes(group.id) ? [...new Set([...group.taskIds, taskId])] : group.taskIds.filter(id => id !== taskId), ...(group.missingTaskIds ? { missingTaskIds: group.missingTaskIds.filter(id => id !== taskId) } : {}) })) });
}
export function deletePlanTasks(plan: Plan, ids: Set<string>): Plan {
  if (plan.schemaVersion === 6) return removeRepeatTasks(plan, ids);
  const tasks = plan.tasks.filter(task => !ids.has(task.id)).map(task => task.parentTaskId && ids.has(task.parentTaskId) ? { ...task, parentTaskId: null } : task);
  if (plan.schemaVersion >= 5) return { ...plan, tasks, goalTree: unlinkGoalTasks(plan.goalTree, ids) };
  // Older undo fixtures and pre-migration operations keep their original contract.
  return { ...plan, tasks, ...(plan.mandala ? { mandala: { ...plan.mandala, areas: plan.mandala.areas.map(area => ({ ...area, taskIds: area.taskIds.map(id => ids.has(id) ? "" : id) })) } } : {}) };
}
export function splitTask(plan: Plan, id: string, entries: Array<{ id: string; title: string }>, summaryOnly: boolean): Plan {
  if (summaryOnly && plan.tasks.find(task => task.id === id)?.repeatSeriesId) plan = detachRepeatOccurrence(plan, id);
  const parent = plan.tasks.find(task => task.id === id);
  if (!parent || entries.length < 2 || entries.length > 32 || typeof summaryOnly !== "boolean") throw new Error("나눌 원본과2~32개의 새 실행 업무를 확인해주세요.");
  const titles = new Set(plan.tasks.filter(task => !task.done && !task.summaryOnly && (task.id !== id || !summaryOnly)).map(taskTitleKey));
  const children: Task[] = entries.map(entry => {
    const title = entry.title.trim(), key = taskTitleKey({ title, plannedDate: parent.plannedDate, startTime: null });
    if (!title || title.length > 120 || titles.has(key)) throw new Error("새 실행 업무는 비어 있지 않은120자 이내 이름으로, 진행 중인 업무와 중복되지 않게 입력해주세요.");
    titles.add(key);
    return { id: entry.id, title, notes: "", plannedDate: parent.plannedDate, categoryId: parent.categoryId ?? null, tagIds: [...(parent.tagIds ?? [])], importance: "normal", dueDate: null, dueTime: null, priority: "normal", done: false, parentTaskId: id, minutes: null, bufferMinutes: null, startTime: null, endTime: null, endDate: null, endDayOffset: null };
  });
  const next = { ...plan, tasks: [...plan.tasks.map(task => task.id === id ? { ...task, summaryOnly } : task), ...children], goalTree: { ...plan.goalTree, groups: plan.goalTree.groups.map(group => group.taskIds.includes(id) ? { ...group, taskIds: [...group.taskIds, ...children.map(task => task.id)] } : group) } };
  if (!validPlan(next)) throw new Error("업무5000개·목표 연결5000개 한도나 업무 관계를 확인해주세요. 원본과 입력은 유지했어요.");
  return next;
}
