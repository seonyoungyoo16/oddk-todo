import type { Plan, Task } from "../../supabase/functions/_shared/plan.ts";
import { validPlan, isClock, isPlanDate } from "../../supabase/functions/_shared/plan.ts";
import { deriveScheduleEnd } from "../../supabase/functions/_shared/schedule.ts";
import type { EditorDraft } from "./workspace-draft.ts";
import { parseTaskTimeDraft } from "./task-time.ts";
import { taskTitleKey } from "./task-identity.ts";
import { addDraftTag, prepareTaskTags } from "./task-tags.ts";

type SimpleDraft = Pick<EditorDraft, "title" | "work" | "buffer" | "done" | "notes" | "importance" | "tagIds" | "pendingTags" | "tagInput"> & { schedule?: { start: string; date: string } };

// Only the fields exposed by the simplified editor may change here.
export function updateSimpleTask(plan: Plan, taskId: string, draft: SimpleDraft): Plan {
  const task = plan.tasks.find(item => item.id === taskId);
  if (!task) throw new Error("수정할 할 일을 찾을 수 없어요. 최신 목록을 확인해주세요.");
  const title = draft.title.trim();
  if (!title) throw new Error("할 일을 입력해주세요.");
  const duration = parseTaskTimeDraft(draft.work, draft.buffer);
  if (duration.error) throw new Error(duration.error);
  const requestedStart = draft.schedule ? draft.schedule.start.trim() : task.startTime;
  if (requestedStart && !isClock(requestedStart)) throw new Error("시작 시각을 확인해주세요.");
  if (draft.schedule?.start && duration.minutes === null) throw new Error("시작 시각을 정하려면 작업 시간과 여유 시간을 먼저 입력해주세요.");
  const startTime = duration.minutes === null ? null : requestedStart || null;
  const plannedDate = startTime && draft.schedule ? draft.schedule.date : task.plannedDate;
  if (draft.schedule && startTime && !isPlanDate(plannedDate)) throw new Error("시간표에 표시할 날짜를 선택해주세요.");
  const tagDraft = { ...draft, tagIds: draft.tagIds ?? task.tagIds ?? [] };
  const tags = prepareTaskTags(plan, draft.tagInput?.trim() ? addDraftTag(plan, tagDraft, draft.tagInput, () => crypto.randomUUID()) : tagDraft);
  let timing: Partial<Task> = {};
  if (duration.minutes !== task.minutes || duration.bufferMinutes !== task.bufferMinutes || startTime !== task.startTime || plannedDate !== task.plannedDate) {
    const end = startTime && duration.minutes !== null ? deriveScheduleEnd(plannedDate, startTime, duration.minutes) : null;
    if (startTime && !end) throw new Error("변경한 소요시간으로 종료 시각을 계산할 수 없어요.");
    timing = { plannedDate, minutes: duration.minutes, bufferMinutes: duration.bufferMinutes, startTime,
      endTime: end?.endTime ?? null, endDate: end?.endDate ?? null, endDayOffset: end?.endDayOffset ?? null,
      ...(startTime === null && task.reminderMinutes !== undefined ? { reminderMinutes: null } : {}) };
  }
  const edited: Task = { ...task, ...timing, title, notes: draft.notes ?? task.notes ?? "",
    tagIds: tags.tagIds, importance: draft.importance ?? task.importance ?? "normal",
    done: task.summaryOnly ? task.done : draft.done };
  if (!edited.done && !edited.summaryOnly && plan.tasks.some(item => item.id !== taskId && !item.done && !item.summaryOnly && taskTitleKey(item) === taskTitleKey(edited))) throw new Error("같은 내용의 할 일이 이미 있어요.");
  const next = { ...tags.plan, tasks: plan.tasks.map(item => item.id === taskId ? edited : item) };
  if (!validPlan(next)) throw new Error("할 일·태그·중요도·소요시간을 확인해주세요. 입력은 그대로 남아 있어요.");
  return next;
}
