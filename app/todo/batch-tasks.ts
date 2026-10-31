import type { Plan, Task } from "../../supabase/functions/_shared/plan.ts";
import { isPlanDate, validPlan } from "../../supabase/functions/_shared/plan.ts";
import { validTaxonomyReferences } from "../../supabase/functions/_shared/taxonomy.ts";
import { taskTitleKey } from "./task-identity.ts";

export const MAX_TASK_PARAGRAPH = 2000;
export const MAX_BATCH_TASKS = 32;
export function parseTaskCandidates(value: unknown): string[] {
  if (!value || typeof value !== "object" || !("titles" in value) || !Array.isArray(value.titles) || !value.titles.length || value.titles.length > MAX_BATCH_TASKS) throw Error("나눈 할 일은 1~32개여야 해요. 원문을 조금 나눠 다시 시도해주세요.");
  return value.titles.map(title => {
    if (typeof title !== "string" || !title.trim() || title.trim().length > 120 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(title)) throw Error("각 할 일은 1~120자로 적어주세요.");
    return title.trim();
  });
}
export function addTaskCandidates(plan: Plan, titles: string[], context: { date: string | null; categoryId: string | null; tagIds: string[] }, makeId: () => string): Plan {
  const candidates = parseTaskCandidates({ titles });
  if (context.date !== null && !isPlanDate(context.date)) throw Error("추가할 날짜를 확인해주세요.");
  if (!validTaxonomyReferences([{ categoryId: context.categoryId, tagIds: context.tagIds }], plan.categories, plan.tags)) throw Error("분류가 바뀌었어요. 원문을 유지했으니 다시 확인해주세요.");
  const existing = new Set(plan.tasks.filter(task => !task.done && !task.summaryOnly).map(taskTitleKey));
  const ids = new Set(plan.tasks.map(task => task.id));
  const tasks: Task[] = candidates.map(title => {
    const key = taskTitleKey({ title, plannedDate: context.date, startTime: null });
    if (existing.has(key)) throw Error(`이미 있는 할 일이에요: ${title}. 중복 항목을 지우거나 내용을 바꿔주세요.`);
    existing.add(key);
    const id = makeId();
    if (!id || ids.has(id)) throw Error("할 일을 구분하지 못했어요. 입력은 유지했으니 다시 추가해주세요.");
    ids.add(id);
    return { id, title, notes: "", minutes: null, bufferMinutes: null, startTime: null, endTime: null, endDate: null, endDayOffset: null, priority: "normal", importance: "normal", dueDate: null, dueTime: null, done: false, plannedDate: context.date, categoryId: context.categoryId, tagIds: [...context.tagIds] };
  });
  const next = { ...plan, tasks: [...plan.tasks, ...tasks] };
  if (!validPlan(next)) throw Error("추가할 할 일을 확인해주세요. 기존 목록과 원문은 그대로 유지했어요.");
  return next;
}
