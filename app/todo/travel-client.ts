import { validLookupPayload } from "../../supabase/functions/_shared/travel-query.ts";
import type { LookupPayload, TravelQuery } from "../../supabase/functions/_shared/travel-query.ts";
const endpoint = "https://synxmskamifpovuziecx.supabase.co/functions/v1/travel-lookup";
export async function lookupTravel(query: TravelQuery, signal: AbortSignal): Promise<LookupPayload & { cached: boolean }> {
  try {
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(query), signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]) });
    const body: unknown = await response.json();
    if (!response.ok) throw new Error(body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : "조회하지 못했어요. 입력을 유지했으니 다시 시도해주세요.");
    if (!validLookupPayload(body, query)) throw new Error("조회 결과가 현재 조건과 맞지 않아요. 다시 조회하거나 직접 입력해주세요.");
    return { ...body, cached: "cached" in body && body.cached === true };
  } catch (error) {
    if (signal.aborted) throw error;
    if (error instanceof Error && /[가-힣]/.test(error.message)) throw error;
    throw new Error("조회 연결이 끊겼거나 대기가 길어졌어요. 입력은 유지했으니 다시 조회하거나 직접 입력해주세요.");
  }
}
