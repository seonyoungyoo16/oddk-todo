import { validPlan } from "./plan.ts";
import type { Plan, PlanV2, PlanData } from "./plan.ts";

export type PlanLoad = { ok: true; plan: Plan; migrated: boolean } | { ok: false; error: string; raw: string };

function datedPlan(value: PlanData): value is Plan | PlanV2 { return "schemaVersion" in value; }

export function loadPlan(raw: string): PlanLoad {
  let value: unknown;
  try { value = JSON.parse(raw); }
  catch { return { ok: false, error: "저장된 JSON을 읽을 수 없어요. 원본을 백업한 뒤 복구해주세요.", raw }; }
  if (value && typeof value === "object" && "schemaVersion" in value && value.schemaVersion !== 2 && value.schemaVersion !== 3) return { ok: false, error: "이 앱에서 지원하지 않는 데이터 버전이에요. 원본은 그대로 보관돼 있어요.", raw };
  if (!validPlan(value)) return { ok: false, error: "저장된 내용의 형식을 확인해야 해요. 원본을 백업한 뒤 복구해주세요.", raw };
  if (datedPlan(value)) {
    if (value.schemaVersion === 3) return { ok: true, plan: value, migrated: false };
    return { ok: true, migrated: true, plan: { ...value, schemaVersion: 3, tasks: value.tasks.map(task => ({ ...task, notes: task.notes ?? "" })) } };
  }
  return { ok: true, migrated: true, plan: { ...value, schemaVersion: 3, tasks: value.tasks.map(task => ({ ...task, startTime: task.startTime ?? null, plannedDate: null, notes: task.notes ?? "" })), reviewsByDate: {} } };

}

type StoragePort = { getItem(key: string): string | null; setItem(key: string, value: string): void };
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
  if (storage.getItem(key + ".before-v3") === null) storage.setItem(key + ".before-v3", raw);
}
