import { parseTaskCandidates, MAX_TASK_PARAGRAPH } from "./batch-tasks.ts";

export const TASK_AI_ENDPOINT = "https://desktop-m9bcsrv.tailba6cb5.ts.net/split";
export async function splitWithRemoteAI(text: string, signal: AbortSignal, token: string | null, fetcher: typeof fetch = fetch): Promise<string[]> {
  if (!token) throw Error("외부에서 AI 추가를 사용하려면 먼저 로그인해주세요.");
  if (!text.trim() || text.length > MAX_TASK_PARAGRAPH) throw Error("할 일을 1~2000자로 적어주세요.");
  try {
    const response = await fetcher(TASK_AI_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ text }), signal: AbortSignal.any([signal, AbortSignal.timeout(100000)]), redirect: "error", cache: "no-store", credentials: "omit" });
    const raw = await response.text();
    if (raw.length > 80000) throw Error("AI 응답이 너무 길어요. 원문을 나눠 다시 시도해주세요.");
    const body = JSON.parse(raw);
    if (!response.ok) throw Error(typeof body?.error === "string" ? body.error : "AI 연결을 확인해주세요. 원문은 유지했어요.");
    return parseTaskCandidates(body);
  } catch (error) {
    if (signal.aborted) throw error;
    if (error instanceof Error && /[가-힣]/.test(error.message)) throw error;
    throw Error("AI PC에 연결하지 못했어요. PC와 인터넷 연결을 확인한 뒤 다시 추가해주세요. 원문은 유지했어요.");
  }
}
