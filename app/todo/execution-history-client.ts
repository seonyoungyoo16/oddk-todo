import { isPlanDate } from "../../supabase/functions/_shared/plan";
import { checkExecutionScope, currentExecutionPlan, executionApi } from "./execution-client";
import type { ExecutionHistory } from "./execution-client";
import { readLocalExecutions } from "./execution-idb";
import { localExecutionHistory } from "./execution-local-model";

export async function readDatedExecutionHistory(scope: string, date: string, cursor: ExecutionHistory["cursor"] = null): Promise<ExecutionHistory> {
  if (!isPlanDate(date)) throw new Error("조회할 날짜를 확인해주세요.");
  await checkExecutionScope(scope);
  let history: ExecutionHistory;
  if (scope === "local") {
    const data = await readLocalExecutions(() => currentExecutionPlan(scope));
    history = { ...localExecutionHistory(data, date, date, new Date().toISOString()), cursor: null };
  } else {
    history = await executionApi(scope, { action: "history", from: date, to: date, limit: 50, cursor }) as ExecutionHistory;
  }
  await checkExecutionScope(scope);
  return history;
}
