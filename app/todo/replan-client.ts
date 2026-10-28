import type { ReplanPreview } from "../../supabase/functions/_shared/replan";
import { assertCurrentReplan } from "../../supabase/functions/_shared/replan";
import { sameValue } from "./json-equality";
import { currentExecutionPlan, checkExecutionScope } from "./execution-client";
import { localExecutionTransaction, withLocalExecutionLock } from "./execution-idb";
import { commitAccountReplan, writePlan } from "./sync-store";

export async function commitReplan(scope: string, preview: ReplanPreview, revision: number) {
  await checkExecutionScope(scope);
  assertCurrentReplan(preview, new Date().toISOString());
  if (!sameValue(currentExecutionPlan(scope), preview.expected)) throw new Error("계획이 바뀌었어요. 다시 미리보기를 만들어주세요.");
  if (scope !== "local") return commitAccountReplan(scope, preview.expected, preview.after, preview.options, revision);
  return withLocalExecutionLock(async () => {
    await checkExecutionScope(scope);
    // Finish the read transaction before writing the plan. The Web Lock excludes
    // all timer commands until the synchronous latest-plan check/write completes.
    const data = await localExecutionTransaction(current => current);
    if (data.revision !== revision || data.records.some(r => r.endedAt === null)) throw new Error("시간 기록이 바뀌었어요. 기록을 종료하고 다시 미리보기를 만들어주세요.");
    assertCurrentReplan(preview, new Date().toISOString());
    if (!sameValue(currentExecutionPlan(scope), preview.expected)) throw new Error("계획이 바뀌었어요. 다시 미리보기를 만들어주세요.");
    writePlan(preview.after);
    return true;
  }, true);
}
