import { assertCurrentReplan, previewReplan } from "../_shared/replan.ts";
import { sameValue } from "../_shared/json-equality.ts";
import type { Plan } from "../_shared/plan.ts";
import type { ExecutionRecord } from "../_shared/execution.ts";
import type { ReplanRequest } from "./request.ts";
export class ReplanRequestError extends Error {
  readonly status: number;
  constructor(message: string, status = 409) { super(message); this.status = status; }
}
export function validateReplanRequest(request: ReplanRequest, context: { plan: Plan; planVersion: number; revision: number; current: ExecutionRecord | null; now: string }) {
  if (context.planVersion !== request.version || context.revision !== request.executionRevision) throw new ReplanRequestError("계획이나 실제 기록이 바뀌었어요. 최신 상태에서 다시 미리보기를 만들어주세요.");
  if (context.current !== null) throw new ReplanRequestError("기록 중인 작업을 먼저 종료해주세요. 실제 기록은 유지했어요.");
  let preview;
  try { preview = previewReplan(context.plan, request.options); }
  catch (error) { throw new ReplanRequestError(error instanceof Error ? error.message : "재조정 설정을 확인해주세요.", 400); }
  if (preview.errors.length) throw new ReplanRequestError(preview.errors[0], 400);
  try { assertCurrentReplan(preview, context.now); } catch (error) { throw new ReplanRequestError(error instanceof Error ? error.message : "미리보기를 다시 확인해주세요."); }
  if (!sameValue(preview.after, request.plan)) throw new ReplanRequestError("승인한 변경안과 최신 계획의 계산 결과가 달라요. 다시 확인해주세요.");
  if (!preview.changes.length) throw new ReplanRequestError("재조정할 변경이 없어요. 현재 계획은 유지했어요.");
  const firstStart = preview.firstStart === null ? null : new Date(`${preview.options.date}T${String(Math.floor(preview.firstStart / 60)).padStart(2, "0")}:${String(preview.firstStart % 60).padStart(2, "0")}:00+09:00`).toISOString();
  return { plan: preview.after, firstStart };
}
