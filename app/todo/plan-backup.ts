import { loadPlan } from "../../supabase/functions/_shared/plan-migration.ts";
import type { Plan } from "../../supabase/functions/_shared/plan.ts";
import { planGoalBoards } from "./goal-boards.ts";

export const MAX_PLAN_BACKUP_BYTES = 10 * 1024 * 1024;
export function parsePlanBackup(raw: string): Plan {
  if (new TextEncoder().encode(raw).length > MAX_PLAN_BACKUP_BYTES) throw Error("백업 파일은 10MB까지 읽을 수 있어요.");
  const text = raw.replace(/^\uFEFF/, "");
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw Error("JSON 파일을 읽지 못했어요. 다른 백업 파일을 선택해주세요."); }
  if (value && typeof value === "object" && "type" in value && value.type === "oddk-executions") throw Error("실적 백업 파일이에요. 할 일·목표가 담긴 계획 백업 파일을 선택해주세요.");
  const loaded = loadPlan(text);
  if (!loaded.ok) throw Error(loaded.error);
  return loaded.plan;
}

export function summarizePlanBackup(plan: Plan) {
  const dates = new Set(plan.tasks.map(task => task.plannedDate).filter(Boolean));
  for (const date of Object.keys(plan.availabilityByDate ?? {})) dates.add(date);
  return { tasks: plan.tasks.length, goals: planGoalBoards(plan).length, dates: dates.size };
}
export function planBackupSummaryText(plan: Plan) {
  const summary = summarizePlanBackup(plan);
  return `할 일 ${summary.tasks}개 · 목표 ${summary.goals}개 · 계획 날짜 ${summary.dates}일`;
}
