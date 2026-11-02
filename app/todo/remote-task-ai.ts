import { MAX_TASK_PARAGRAPH } from "./batch-tasks.ts";
import { parseTaskAIOutput } from "./task-ai-output.ts";
import type { AIRequestPermit } from "./ai-consent.ts";
import { AI_GATEWAY_ENDPOINT } from "./ai-policy.ts";

export const TASK_AI_ENDPOINT = AI_GATEWAY_ENDPOINT;
export async function splitWithRemoteAI(text: string, signal: AbortSignal, token: string | null, permit: AIRequestPermit, fetcher: typeof fetch = fetch): Promise<string[]> {
  if (!token) throw Error("AI 분석은 로그인 후 사용할 수 있어요. 일반 추가는 로그인 없이 가능해요.");
  if (!text.trim() || text.length > MAX_TASK_PARAGRAPH) throw Error("할 일을 1~2000자로 적어주세요.");
  try {
    permit.assertCurrent(); signal.throwIfAborted();
    const response = await fetcher(TASK_AI_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ text }), signal: AbortSignal.any([signal, AbortSignal.timeout(100000)]), redirect: "error", cache: "no-store", credentials: "omit" });
    const raw = await response.text();
    permit.assertCurrent(); signal.throwIfAborted();
    if (raw.length > 80000) throw Error("AI 응답이 너무 길어요. 원문을 나눠 다시 시도해주세요.");
    const body = JSON.parse(raw);
    if (!response.ok) throw Error(typeof body?.error === "string" ? body.error : "AI 연결을 확인해주세요. 원문은 유지했어요.");
    return parseTaskAIOutput(text, body);
  } catch (error) {
    if (signal.aborted) throw error;
    if (error instanceof Error && /[가-힣]/.test(error.message)) throw error;
    throw Error("AI에 연결하지 못했어요. 다시 분석하거나 일반 추가로 저장해주세요. 원문은 유지했어요.");
  }
}
