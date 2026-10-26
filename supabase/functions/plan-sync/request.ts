import { validPlan } from "../_shared/plan.ts";
import type { Plan } from "../_shared/plan.ts";

export type PlanRequest = { action: "pull" } | { action: "ensure"; plan: Plan } | { action: "push"; plan: Plan; version: number };
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
  if (body.action !== "push" || typeof body.version !== "number" || !Number.isSafeInteger(body.version) || body.version < 1 || body.version >= Number.MAX_SAFE_INTEGER) return bad;
  return { ok: true, body: { action: "push", plan: body.plan, version: body.version } };
}
