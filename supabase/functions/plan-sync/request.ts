import { validPlan } from "../_shared/plan.ts";
import type { PlanData } from "../_shared/plan.ts";
import { validReplanOptions } from "../_shared/replan.ts";
import type { ReplanOptions } from "../_shared/replan.ts";

export type ReplanRequest = { action: "replan"; plan: PlanData; version: number; executionRevision: number; options: ReplanOptions };
export type PlanRequest = { action: "pull" } | { action: "ensure"; plan: PlanData } | { action: "push"; plan: PlanData; version: number } | ReplanRequest;
export type ParsedRequest = { ok: true; body: PlanRequest } | { ok: false; status: 400 | 413; error: string };

export function parsePlanRequest(text: string): ParsedRequest {
  if (new TextEncoder().encode(text).length > 1000000) return { ok: false, status: 413, error: "동기화할 데이터가 너무 커요." };
  let value: unknown;
  try { value = JSON.parse(text); } catch { return { ok: false, status: 400, error: "잘못된 JSON 요청이에요." }; }
  const bad = { ok: false, status: 400, error: "저장할 데이터와 버전을 확인해주세요." } as const;
  if (!value || typeof value !== "object" || Array.isArray(value)) return bad;
  const body = value as Record<string, unknown>;
  if (body.action === "pull") return { ok: true, body: { action: "pull" } };
  if (!validPlan(body.plan)) return bad;
  if (body.action === "ensure") return { ok: true, body: { action: "ensure", plan: body.plan } };
  if (!["push", "replan"].includes(body.action as string) || typeof body.version !== "number" || !Number.isSafeInteger(body.version) || body.version < 1 || body.version >= Number.MAX_SAFE_INTEGER) return bad;
  if (body.action === "replan") {
    if (Object.keys(body).length !== 5 || !("schemaVersion" in body.plan) || ![5, 6].includes(body.plan.schemaVersion)
      || typeof body.executionRevision !== "number" || !Number.isSafeInteger(body.executionRevision) || body.executionRevision < 0 || body.executionRevision >= Number.MAX_SAFE_INTEGER || !validReplanOptions(body.options)) return bad;
    return { ok: true, body: { action: "replan", plan: body.plan, version: body.version, executionRevision: body.executionRevision, options: { date: body.options.date, baseMinute: body.options.baseMinute, pinnedIds: [...body.options.pinnedIds] } } };
  }
  return { ok: true, body: { action: "push", plan: body.plan, version: body.version } };
}
