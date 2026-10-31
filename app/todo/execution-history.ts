import type { ExecutionRecord } from "../../supabase/functions/_shared/execution.ts";
import { executionTotals } from "../../supabase/functions/_shared/execution.ts";

export function latestFinishedExecution(records: ExecutionRecord[], taskId: string) {
  return records.filter(record => record.taskId === taskId && record.endedAt !== null)
    .sort((a, b) => b.endedAt!.localeCompare(a.endedAt!) || b.startedAt.localeCompare(a.startedAt))[0] ?? null;
}

export function finishedExecutionSummary(record: ExecutionRecord, date?: string) {
  if (!record.endedAt) return null;
  // Use the persisted end, never the wall clock, so completed values cannot keep growing.
  return executionTotals(record, record.endedAt, date);
}
