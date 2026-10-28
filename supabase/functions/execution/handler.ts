import { readJsonBounded } from "../_shared/bounded-json.ts";
import { applyExecutionCommand, parseExecutionRequest, ExecutionCommandError } from "../_shared/execution-command.ts";
import type { ExecutionContext, ExecutionChange, ExecutionCommandRequest, ExecutionRequest } from "../_shared/execution-command.ts";
import { isExecutionTime, validExecutionRecord } from "../_shared/execution.ts";
import type { ExecutionRecord } from "../_shared/execution.ts";
import { sha256 } from "../_shared/push-subscription.ts";

export type ServerContext = ExecutionContext & { planVersion: number; operation: null | { hash: string; version: number } };
export type ExecutionState = { revision: number; current: ExecutionRecord | null; now: string; replayed?: boolean };
export type ExecutionStore = {
  context(user: string, target: string | null, operation: string | null): Promise<ServerContext>;
  commit(user: string, request: ExecutionCommandRequest, hash: string, context: ServerContext, change: ExecutionChange): Promise<ExecutionState>;
  history(user: string, request: Extract<ExecutionRequest, { action: "history" }>): Promise<{ records: ExecutionRecord[]; totals: { workMs: number; breakMs: number }; now: string }>;
};
const origins = new Set(["https://seonyoungyoo16.github.io", "http://localhost:3000", "http://127.0.0.1:3200"]);
const validVersion = (v: number) => Number.isSafeInteger(v) && v >= 0 && v < Number.MAX_SAFE_INTEGER;
function state(value: ExecutionState): ExecutionState {
  if (!value || !validVersion(value.revision) || !isExecutionTime(value.now) || value.current !== null && (!validExecutionRecord(value.current) || value.current.endedAt !== null)) throw new Error("invalid execution state");
  return { revision: value.revision, current: value.current, now: value.now, ...(typeof value.replayed === "boolean" ? { replayed: value.replayed } : {}) };
}
export async function handleExecution(req: Request, deps: { authenticate(token: string): Promise<string | null>; store: ExecutionStore }): Promise<Response> {
  const origin = req.headers.get("origin");
  const headers = { "Cache-Control": "no-store", "Vary": "Origin", ...(origin && origins.has(origin) ? { "Access-Control-Allow-Origin": origin } : {}), "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });
  if (origin && !origins.has(origin)) return reply({ error: "허용되지 않은 사이트예요." }, 403);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return reply({ error: "지원하지 않는 요청이에요." }, 405);
  if (req.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return reply({ error: "JSON으로 요청해주세요." }, 415);
  const token = req.headers.get("authorization")?.match(/^Bearer ([^\s]+)$/i)?.[1];
  if (!token || token.length > 8192) return reply({ error: "로그인해주세요." }, 401);
  try {
    const user = await deps.authenticate(token);
    if (!user) return reply({ error: "로그인이 만료됐어요. 다시 로그인해주세요." }, 401);
    let request: ExecutionRequest | null;
    try { request = parseExecutionRequest(await readJsonBounded(req, 32768)); }
    catch (error) { return reply({ error: "시간 기록 입력을 확인해주세요." }, error instanceof RangeError ? 413 : 400); }
    if (!request) return reply({ error: "시간 기록 입력을 확인해주세요." }, 400);
    if (request.action === "history") {
      const result = await deps.store.history(user, request);
      if (!result || !isExecutionTime(result.now) || !Array.isArray(result.records) || result.records.length > request.limit + 1 || !result.records.every(validExecutionRecord) || !result.totals || ![result.totals.workMs, result.totals.breakMs].every(n => Number.isSafeInteger(n) && n >= 0)) throw new Error("invalid execution history");
      const more = result.records.length > request.limit, records = result.records.slice(0, request.limit), last = records.at(-1);
      return reply({ records, totals: { workMs: result.totals.workMs, breakMs: result.totals.breakMs }, now: result.now, cursor: more && last ? { startedAt: last.startedAt, id: last.id } : null });
    }
    const target = request.action === "command" ? "recordId" in request.command ? request.command.recordId : request.operationId : null;
    const context = await deps.store.context(user, target, request.action === "command" ? request.operationId : null);
    if (request.action === "status") return reply(state({ ...context }));
    const hash = await sha256(JSON.stringify(request));
    if (context.operation) {
      if (context.operation.hash !== hash) return reply({ error: "이미 사용한 요청이에요. 현재 기록을 다시 확인해주세요.", code: "operation" }, 409);
      return reply(state({ ...context, replayed: true }));
    }
    const change = applyExecutionCommand(request, context);
    const result = await deps.store.commit(user, request, hash, context, change);
    return reply(state(result));
  } catch (error) {
    if (error instanceof ExecutionCommandError) return reply({ error: error.message, code: error.code }, error.code === "invalid" ? 400 : error.code === "unavailable" ? 503 : 409);
    const code = error && typeof error === "object" && "code" in error ? error.code : null;
    if (["PT409", "40001", "23505"].includes(code as string)) return reply({ error: "다른 기기에서 먼저 기록을 바꿨어요. 현재 상태를 다시 확인해주세요.", code: "stale" }, 409);
    if (code === "23P01") return reply({ error: "이미 기록된 작업·휴식 시간과 겹쳐요. 시간 구간을 확인해주세요.", code: "overlap" }, 409);
    if (code === "22023") return reply({ error: "시간 기록이 바뀌었거나 입력이 올바르지 않아요. 다시 확인해주세요.", code: "invalid" }, 409);
    if (code === "P0002") return reply({ error: "할 일을 동기화한 뒤 시간 기록을 시작해주세요.", code: "missing" }, 409);
    return reply({ error: "시간 기록을 저장했는지 확인하지 못했어요. 현재 상태를 다시 확인해주세요.", code: "unavailable" }, 503);
  }
}
