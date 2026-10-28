import { isPlanDate } from "../../supabase/functions/_shared/plan.ts";
import type { Plan } from "../../supabase/functions/_shared/plan.ts";

export function rescheduleTask(plan: Plan, id: string, date: string, today: string): Plan {
  if (!isPlanDate(date) || !isPlanDate(today)) throw new Error("옮길 날짜를 올바르게 선택해주세요.");
  const task = plan.tasks.find((task) => task.id === id);
  if (!task || task.done || !task.plannedDate || task.plannedDate >= today) throw new Error("지난 날짜의 미완료 할 일만 다시 계획할 수 있어요.");
  if (task.plannedDate === date) throw new Error("기존 날짜와 다른 날짜를 선택해주세요.");
  return { ...plan, tasks: plan.tasks.map((task) => task.id === id ? { ...task, plannedDate: date, startTime: null, ...(Number(plan.schemaVersion) >= 4 ? { endTime: null, endDate: null, endDayOffset: null } : {}) } : task) };
}

export function saveDatedReview(plan: Plan, date: string, text: string, expected: string): Plan {
  if (!isPlanDate(date) || typeof text !== "string" || text.length > 2000) throw new Error("날짜와 점검 내용을 확인해주세요.");
  if ((plan.reviewsByDate[date] ?? "") !== expected) throw new Error("저장된 점검이 다시 바뀌었어요. 최신 내용을 확인해주세요.");
  return { ...plan, reviewsByDate: { ...plan.reviewsByDate, [date]: text } };
}

export function moveLegacyReview(plan: Plan, date: string, expected: string): Plan {
  if (typeof plan.review !== "string" || !plan.review.trim() || plan.review !== expected) throw new Error("이전 점검 내용이 바뀌었어요. 다시 확인해주세요.");
  if (plan.reviewsByDate[date]) throw new Error("이 날짜에는 점검이 있어요. 비어 있는 날짜를 선택하거나 직접 합쳐주세요.");
  const next = saveDatedReview(plan, date, plan.review, "");
  return { ...next, review: "" };
}

export type ReviewDraft = { text: string; base: string };
export function editReviewDraft(previous: ReviewDraft | undefined, saved: string, text: string): ReviewDraft {
  return { text, base: previous && previous.text !== saved ? previous.base : saved };
}
export function hasReviewConflict(draft: ReviewDraft | undefined, saved: string): boolean {
  return Boolean(draft && draft.text !== saved && draft.base !== saved);
}
