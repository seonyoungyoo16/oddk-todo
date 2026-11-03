import { executionTimerProgress } from "./execution-timer.ts";
import type { ExecutionTimerSource } from "./execution-timer-source.ts";
import { restAlertSegment } from "./rest-alert.ts";

export const EXECUTION_REMINDER_OWNER = "oddk.execution-boundary.v1";
export type Boundary = { key: string; scope: string; recordId: string; phase: "work" | "break"; deadline: number; title: string };
/** Consume the same projection as the visible timer, including server clock offset. */
export function nativeExecutionBoundary(value: ExecutionTimerSource | null, now = Date.now()): Boundary | null {
  if (!value || value.blocked || !value.scope || value.scope === "unreadable-session" || !Number.isFinite(value.clockOffsetMs)) return null;
  const breakLimit = value.breakSegmentKey && value.breakSegmentKey === restAlertSegment(value.record)?.key ? value.breakLimitMinutes : null;
  const progress = executionTimerProgress(value.record, value.task, new Date(now + value.clockOffsetMs).toISOString(), breakLimit);
  if (!progress || !progress.alertKey || !progress.deadlineAt || (progress.phase !== "work" && progress.phase !== "break")) return null;
  return { key: JSON.stringify([value.scope, progress.alertKey]), scope: value.scope, recordId: progress.recordId, phase: progress.phase,
    deadline: Date.parse(progress.deadlineAt) - value.clockOffsetMs, title: progress.title };
}

type Alert = { id: number; extra?: unknown; schedule?: { at?: unknown } };
export type ExecutionAlert = { id: number; title: string; body: string; sound: string; schedule: { at: Date }; extra: { owner: string; scope: string; key: string; recordId: string; deadline: number } };
type Pending = { key: string; id: number; at: number; deadline: number; armed: boolean; title?: string };
export type ExecutionReminderLedger = { consumed: string[]; pending: Pending | null };
export type ExecutionReminderPort = {
  getPending(): Promise<{ notifications: Alert[] }>; getDelivered(): Promise<{ notifications: Alert[] }>;
  cancel(ids: number[]): Promise<void>; removeDelivered(ids: number[]): Promise<void>;
  schedule(alert: ExecutionAlert): Promise<void>;
  readLedger(): Promise<ExecutionReminderLedger | null>; writeLedger(value: ExecutionReminderLedger): Promise<void>;
};
function extra(alert: Alert) {
  const value = alert.extra as Partial<ExecutionAlert["extra"]> | null;
  return value?.owner === EXECUTION_REMINDER_OWNER && typeof value.key === "string" ? value : null;
}
const owned = (values: Alert[]) => values.filter(item => extra(item));
function hash(value: string) { let n = 2166136261; for (const c of value) n = Math.imul(n ^ c.charCodeAt(0), 16777619); return (n >>> 0) % 2147483647 + 1; }

/** Caller serializes this controller with the task-reminder controller. */
export function createNativeExecutionReminderController(port: ExecutionReminderPort, now = Date.now) {
  let revision = 0;
  function invalidate() { revision++; }
  async function reconcile(boundary: Boundary | null) {
    const turn = revision;
    let ledger = await port.readLedger() ?? { consumed: [], pending: null };
    if (!Array.isArray(ledger.consumed) || ledger.consumed.length > 128 || !ledger.consumed.every(key => typeof key === "string")
      || ledger.pending && (!Number.isInteger(ledger.pending.id) || !Number.isFinite(ledger.pending.at) || typeof ledger.pending.key !== "string")) throw Error("타이머 알림 저장 상태를 확인해주세요.");
    ledger = structuredClone(ledger);
    const pending = (await port.getPending()).notifications, delivered = (await port.getDelivered()).notifications;
    const consumed = new Set(ledger.consumed);
    for (const item of owned(delivered)) consumed.add(extra(item)!.key!);
    if (ledger.pending?.armed && ledger.pending.at <= now()) consumed.add(ledger.pending.key);
    ledger.consumed = [...consumed].slice(-128);
    const current = () => turn === revision;
    if (!current()) return;
    const wanted = boundary && !consumed.has(boundary.key) ? boundary : null;
    const reusable = wanted && ledger.pending?.key === wanted.key && ledger.pending.title === wanted.title && ledger.pending.armed && Math.abs(ledger.pending.deadline - wanted.deadline) < 1500
      && pending.some(item => item.id === ledger.pending!.id && extra(item)?.key === wanted.key);
    if (reusable) { await port.writeLedger(ledger); return false; }
    await port.cancel(owned(pending).map(item => item.id));
    const obsoleteDelivered = (item: Alert) => !boundary || extra(item)?.key !== boundary.key;
    // Keep the current delivered alert visible until pause/stop/OFF or a new limit.
    await port.removeDelivered(owned(delivered).filter(obsoleteDelivered).map(item => item.id));
    if (owned((await port.getPending()).notifications).length || owned((await port.getDelivered()).notifications).some(obsoleteDelivered)) throw Error("이전 타이머 알림 취소를 확인하지 못했어요.");
    ledger.pending = null;
    await port.writeLedger(ledger);
    if (!wanted || !current()) return owned(pending).length > 0;
    let reservations = (await port.getPending()).notifications;
    if (reservations.length >= 64) {
      // Execution boundary gets one slot; only the farthest owned task-start alarm may yield it.
      const tasks = reservations.filter(item => (item.extra as { owner?: string })?.owner === "oddk.task-reminder.v1");
      const due = (item: Alert) => { try { const value = JSON.parse((item.extra as { signature: string }).signature).at(-1); return typeof value === "number" ? value : Date.parse(value) || 0; } catch { return 0; } };
      const victim = tasks.sort((a, b) => due(b) - due(a))[0];
      if (!victim) throw Error("타이머 알림을 예약할 공간이 없어요. 기기 알림을 확인해주세요.");
      await port.cancel([victim.id]);
      reservations = (await port.getPending()).notifications;
      if (reservations.length >= 64) throw Error("타이머 알림 예약 공간을 확인하지 못했어요.");
    }
    const ids = new Set(reservations.map(item => item.id)); let id = hash(EXECUTION_REMINDER_OWNER + wanted.key);
    while (ids.has(id)) id = id % 2147483647 + 1;
    const at = Math.max(now() + 1000, wanted.deadline);
    ledger.pending = { key: wanted.key, id, at, deadline: wanted.deadline, armed: false, title: wanted.title };
    await port.writeLedger(ledger);
    if (!current()) { ledger.pending = null; await port.writeLedger(ledger); return; }
    try {
      await port.schedule({ id, title: wanted.title, body: wanted.phase === "work" ? "작업 기준 시간을 넘겼어요." : "휴식 기준 시간을 넘겼어요.", sound: "default", schedule: { at: new Date(at) },
        extra: { owner: EXECUTION_REMINDER_OWNER, scope: wanted.scope, key: wanted.key, recordId: wanted.recordId, deadline: wanted.deadline } });
      if (!current()) { await port.cancel([id]); ledger.pending = null; await port.writeLedger(ledger); return; }
      if (!(await port.getPending()).notifications.some(item => item.id === id && extra(item)?.key === wanted.key)) throw Error("타이머 알림 예약을 확인하지 못했어요.");
      ledger.pending.armed = true;
      await port.writeLedger(ledger);
      return true;
    } catch {
      await port.cancel([id]);
      ledger.pending = null;
      await port.writeLedger(ledger);
      throw Error("타이머 알림을 예약하지 못했어요. 기기 알림 상태를 확인해주세요.");
    }
  }
  return { reconcile, invalidate };
}
