import { validPlan } from "./plan.ts";
import type { Plan, PlanV2, PlanV3, PlanV4, PlanData, Task } from "./plan.ts";
import { deriveScheduleEnd } from "./schedule.ts";
import { goalTreeFromMandala } from "./goal-tree.ts";

export type PlanLoad = { ok: true; plan: Plan; migrated: boolean } | { ok: false; error: string; raw: string };

function datedPlan(value: PlanData): value is Plan | PlanV4 | PlanV3 | PlanV2 { return "schemaVersion" in value; }

// Use for legacy saved tasks, draft bases and undo records; never for partial UI input.
export function taskToV4(task: Task): Task | null {
  const startTime = task.startTime ?? null;
  const base = { ...task, notes: task.notes ?? "", startTime };
  if (startTime === null) return { ...base, endTime: null, endDate: null, endDayOffset: null };
  const end = deriveScheduleEnd(task.plannedDate, startTime, task.minutes!);
  return end ? { ...base, ...end } : null;
}

export function loadPlan(raw: string): PlanLoad {
  let value: unknown;
  try { value = JSON.parse(raw); }
  catch { return { ok: false, error: "저장된 JSON을 읽을 수 없어요. 원본을 백업한 뒤 복구해주세요.", raw }; }
  if (value && typeof value === "object" && "schemaVersion" in value && ![2, 3, 4, 5, 6].includes(Number(value.schemaVersion))) return { ok: false, error: "이 앱에서 지원하지 않는 데이터 버전이에요. 원본은 그대로 보관돼 있어요.", raw };
  if (!validPlan(value)) return { ok: false, error: "저장된 내용의 형식을 확인해야 해요. 원본을 백업한 뒤 복구해주세요.", raw };
  let dated: PlanV2 | PlanV3 | PlanV4;
  if (datedPlan(value)) {
    if (value.schemaVersion === 5 || value.schemaVersion === 6) return { ok: true, plan: value, migrated: false };
    dated = value as PlanV2 | PlanV3 | PlanV4;
  } else {
    dated = { ...value, schemaVersion: 2, tasks: value.tasks.map(task => ({ ...task, startTime: task.startTime ?? null, plannedDate: null })), reviewsByDate: {} };
  }
  const tasks = dated.schemaVersion === 4 ? dated.tasks : dated.tasks.map(taskToV4);
  if (tasks.some(task => task === null)) return { ok: false, error: "기존 일정의 종료 날짜가 지원 범위를 넘어요. 원본을 백업한 뒤 날짜를 확인해주세요.", raw };
  const plan: Plan = { ...dated, schemaVersion: 5, tasks: tasks as Task[], goalTree: dated.goalTree ?? goalTreeFromMandala(dated.mandala, tasks as Task[]) };
  if (!validPlan(plan)) return { ok: false, error: "기존 시간 정보를 보존해 변환하지 못했어요. 원본을 백업한 뒤 확인해주세요.", raw };
  return { ok: true, migrated: true, plan };

}

type StoragePort = { getItem(key: string): string | null; setItem(key: string, value: string): void };
// V6 is opt-in on the first repeat/reminder change; ordinary V5 plans stay V5.
export function preserveV6Backup(storage: StoragePort, key: string, raw: string, next: Plan) {
  const original = JSON.parse(raw);
  if (next.schemaVersion === 6 && original.schemaVersion !== 6 && storage.getItem(key + ".before-v6") === null) storage.setItem(key + ".before-v6", raw);
}
export function upgradeStoredPlan(storage: StoragePort, key: string): PlanLoad | null {
  const raw = storage.getItem(key);
  if (raw === null) return null;
  const result = loadPlan(raw);
  if (!result.ok || !result.migrated) return result;
  // Each atomic setItem either completes or throws. Never replace the original first.
  preserveMigrationBackup(storage, key, raw);
  storage.setItem(key, JSON.stringify(result.plan));
  return result;
}

export function preserveMigrationBackup(storage: StoragePort, key: string, raw: string) {
  const value = JSON.parse(raw);
  if (value.schemaVersion === undefined && storage.getItem(key + ".before-v2") === null) storage.setItem(key + ".before-v2", raw);
  if ((value.schemaVersion === undefined || value.schemaVersion === 2) && storage.getItem(key + ".before-v3") === null) storage.setItem(key + ".before-v3", raw);
  if ((value.schemaVersion === undefined || value.schemaVersion === 2 || value.schemaVersion === 3) && storage.getItem(key + ".before-v4") === null) storage.setItem(key + ".before-v4", raw);
  if (storage.getItem(key + ".before-v5") === null) storage.setItem(key + ".before-v5", raw);
}
