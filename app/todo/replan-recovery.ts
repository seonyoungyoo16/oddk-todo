import type { Plan, Task } from "../../supabase/functions/_shared/plan.ts";
import { validPlan } from "../../supabase/functions/_shared/plan.ts";
import type { ReplanPreview } from "../../supabase/functions/_shared/replan.ts";
import { sameValue } from "../../supabase/functions/_shared/json-equality.ts";

const fields = ["startTime", "endTime", "endDate", "endDayOffset", "reminderMinutes", "repeatException"] as const;
type Schedule = Partial<Pick<Task, typeof fields[number]>>;
export type ReplanRecovery = { version: 1; date: string; changes: { id: string; title: string; hash: string; before: Schedule; after: Schedule }[] };
const object = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === "object" && !Array.isArray(v));
function schedule(task: Task): Schedule { return Object.fromEntries(fields.filter(f => task[f] !== undefined).map(f => [f, task[f]])); }
function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (object(value)) return "{" + Object.keys(value).filter(k => value[k] !== undefined).sort().map(k => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
  return JSON.stringify(value);
}
async function fingerprint(task: Task) {
  const metadata = { ...task }; for (const f of fields) delete metadata[f];
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(metadata)));
  return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, "0")).join("");
}
export function validReplanRecovery(v: unknown): v is ReplanRecovery | null {
  if (v === null) return true;
  if (!object(v) || Object.keys(v).length !== 3 || v.version !== 1 || typeof v.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v.date) || !Array.isArray(v.changes) || v.changes.length > 5000) return false;
  const validSchedule = (s: unknown) => object(s) && Object.keys(s).every(k => fields.includes(k as typeof fields[number]) && (s[k] === null || typeof s[k] === "string" || typeof s[k] === "boolean" || Number.isSafeInteger(s[k])));
  return v.changes.every(c => object(c) && Object.keys(c).length === 5 && typeof c.id === "string" && c.id.length <= 1000 && typeof c.title === "string" && c.title.length <= 1000 && typeof c.hash === "string" && /^[a-f0-9]{64}$/.test(c.hash) && validSchedule(c.before) && validSchedule(c.after)) && new Set(v.changes.map(c => c.id)).size === v.changes.length;
}
export async function makeReplanRecovery(preview: ReplanPreview): Promise<ReplanRecovery> {
  return { version: 1, date: preview.options.date, changes: await Promise.all(preview.changes.map(async c => {
    const hash = await fingerprint(c.before);
    if (hash !== await fingerprint(c.after)) throw new Error("재조정의 변경 범위를 확인해주세요.");
    return { id: c.before.id, title: c.before.title, hash, before: schedule(c.before), after: schedule(c.after) };
  })) };
}
export async function restoreReplanRecovery(plan: Plan, recovery: ReplanRecovery): Promise<Plan> {
  if (!validPlan(plan) || !validReplanRecovery(recovery)) throw new Error("복구안 형식을 확인해주세요.");
  const patches = new Map<string, Schedule>();
  for (const c of recovery.changes) {
    const task = plan.tasks.find(t => t.id === c.id);
    if (!task || await fingerprint(task) !== c.hash || !sameValue(schedule(task), c.after) && !sameValue(schedule(task), c.before)) throw new Error("재조정 뒤 변경되거나 삭제된 할 일이 있어요. 현재 계획을 보존하고 복구를 멈췄어요.");
    patches.set(c.id, c.before);
  }
  const next = { ...plan, tasks: plan.tasks.map(task => { const patch = patches.get(task.id); if (!patch) return task; const copy = { ...task }; for (const f of fields) delete copy[f]; return { ...copy, ...patch } as Task; }) };
  if (!validPlan(next)) throw new Error("복구할 시각과 현재 계획의 형식이 맞지 않아요. 현재 계획은 유지했어요.");
  return next;
}
