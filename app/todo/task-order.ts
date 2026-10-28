import type { Plan, Task } from "../../supabase/functions/_shared/plan.ts";
import { deadlineMinute } from "../../supabase/functions/_shared/task-planning.ts";
import { clockMinute, dateOrdinal, isClock, isPlanDate } from "../../supabase/functions/_shared/calendar.ts";
export type TaskSort = "manual" | "importance" | "deadline";
const importanceRank = { high: 0, normal: 1, low: 2 };
export const taskImportance = (task: Task) => task.importance ?? "normal";
export function sortTasks(tasks: Task[], sort: TaskSort): Task[] {
  if (sort === "manual") return [...tasks];
  return tasks.map((task, index) => ({ task, index })).sort((a, b) => {
    const done = Number(a.task.done) - Number(b.task.done);
    const importance = importanceRank[taskImportance(a.task)] - importanceRank[taskImportance(b.task)];
    const left = deadlineMinute(a.task) ?? Infinity, right = deadlineMinute(b.task) ?? Infinity;
    const deadline = left === right ? 0 : left < right ? -1 : 1;
    return done || (sort === "importance" ? importance || deadline : deadline || importance) || a.index - b.index;
  }).map(value => value.task);
}
export function urgencyLabel(task: Task, nowDate: string, nowTime: string): string {
  if (task.done || !isPlanDate(nowDate) || !isClock(nowTime)) return "";
  const deadline = deadlineMinute(task);
  if (deadline === null) return "";
  const now = dateOrdinal(nowDate) * 1440 + clockMinute(nowTime);
  if (now >= deadline) return "마감 지남";
  if (task.dueDate === nowDate) return "오늘 마감";
  if (dateOrdinal(task.dueDate!) === dateOrdinal(nowDate) + 1) return "내일 마감";
  return "";
}
export function reorderVisibleTasks(plan: Plan, expected: string[], next: string[]): Plan {
  const ids = new Set(expected);
  if (ids.size !== expected.length || next.length !== expected.length || new Set(next).size !== ids.size || next.some(id => !ids.has(id))) throw new Error("옮길 할 일 목록이 달라졌어요. 최신 목록을 확인해주세요.");
  const current = plan.tasks.filter(task => ids.has(task.id));
  if (current.length !== expected.length || current.some((task, i) => task.id !== expected[i])) throw new Error("저장된 순서가 바뀌었어요. 최신 목록을 확인해주세요.");
  const tasks = new Map(current.map(task => [task.id, task])); let index = 0;
  return { ...plan, tasks: plan.tasks.map(task => ids.has(task.id) ? tasks.get(next[index++])! : task) };
}
export function moveVisibleTask(plan: Plan, visibleIds: string[], id: string, direction: -1 | 1): Plan {
  const index = visibleIds.indexOf(id), target = index + direction;
  if (index < 0 || target < 0 || target >= visibleIds.length) return plan;
  const next = [...visibleIds]; [next[index], next[target]] = [next[target], next[index]];
  return reorderVisibleTasks(plan, visibleIds, next);
}
export function selectedTaskSummary(tasks: Task[], selectedIds: string[], visibleIds: string[]) {
  const selected = new Set(selectedIds), visible = new Set(visibleIds);
  const existing = new Set(tasks.map(task => task.id));
  const targets = tasks.filter(task => selected.has(task.id));
  return { tasks: targets, visible: targets.filter(task => visible.has(task.id)).length, hidden: targets.filter(task => !visible.has(task.id)).length, missing: [...selected].filter(id => !existing.has(id)).length };
}
