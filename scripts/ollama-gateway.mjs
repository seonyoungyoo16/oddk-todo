import http from "node:http";
import { pathToFileURL } from "node:url";
import { taskSplitRequest } from "../app/todo/local-task-ai.ts";
import { parseTaskCandidates, MAX_TASK_PARAGRAPH } from "../app/todo/batch-tasks.ts";

const project = "https://synxmskamifpovuziecx.supabase.co";
const publishableKey = "sb_publishable_ACwZjSLbL_dU9hilmAV7CQ_FEH8AT29";
const allowedOrigin = "https://seonyoungyoo16.github.io";
export async function authenticate(token, fetcher = fetch) {
  const response = await fetcher(`${project}/auth/v1/user`, { headers: { apikey: publishableKey, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000), redirect: "error" });
  if (!response.ok) return null;
  const user = await response.json();
  return typeof user.id === "string" && user.role === "authenticated" && !user.is_anonymous ? user.id : null;
}
export async function generateTitles(text, signal, fetcher = fetch) {
  const response = await fetcher("http://127.0.0.1:11434/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(taskSplitRequest(text)), signal, redirect: "error" });
  if (!response.ok) throw Error("Ollama 응답 오류");
  const raw = await response.text();
  if (raw.length > 80000) throw Error("응답 크기 초과");
  const data = JSON.parse(raw);
  if (data.done !== true || data.done_reason === "length" || typeof data.message?.content !== "string") throw Error("분리 미완료");
  return parseTaskCandidates(JSON.parse(data.message.content));
}
export function createGateway({ verify = authenticate, generate = generateTitles, now = Date.now } = {}) {
  const users = new Map();
  let running = false, globalWindow = 0, globalCount = 0, authRunning = 0;
  return http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (origin === allowedOrigin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    }
    const send = (status, body) => { if (!res.destroyed) { res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(body)); } };
    if (req.url === "/health" && req.method === "GET") return send(200, { ok: true, service: "oddk-task-ai" });
    if (req.url !== "/split") return send(404, { error: "찾을 수 없는 요청이에요." });
    if (origin && origin !== allowedOrigin) return send(403, { error: "허용되지 않은 앱이에요." });
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
    if (req.method !== "POST") return send(405, { error: "지원하지 않는 요청이에요." });
    const token = /^Bearer ([A-Za-z0-9._-]{20,8192})$/.exec(req.headers.authorization ?? "")?.[1];
    if (!token) return send(401, { error: "로그인 후 AI 추가를 사용할 수 있어요." });
    if (authRunning >= 4) return send(429, { error: "요청이 많아요. 잠시 후 다시 시도해주세요." });
    let user;
    authRunning++;
    try { user = await verify(token); } catch { return send(503, { error: "로그인 확인에 실패했어요. 잠시 후 다시 시도해주세요." }); }
    finally { authRunning--; }
    if (!user) return send(401, { error: "다시 로그인해주세요." });
    if (!(req.headers["content-type"] ?? "").startsWith("application/json")) return send(415, { error: "입력 형식을 확인해주세요." });
    if (Number(req.headers["content-length"] ?? 0) > 10000) return send(413, { error: "할 일을 2000자 이내로 적어주세요." });
    const timestamp = now();
    for (const [id, state] of users) if (timestamp - state.start >= 60000) users.delete(id);
    if (timestamp - globalWindow >= 3600000) { globalWindow = timestamp; globalCount = 0; }
    const state = users.get(user) ?? { start: timestamp, count: 0 };
    if (state.count >= 10 || globalCount >= 100 || running) { res.setHeader("Retry-After", "10"); return send(429, { error: "AI가 사용 중이거나 요청 한도에 도달했어요. 잠시 후 다시 추가해주세요." }); }
    let text;
    try {
      let bytes = 0; const chunks = [];
      for await (const chunk of req) { bytes += chunk.length; if (bytes > 10000) return send(413, { error: "입력이 너무 길어요." }); chunks.push(chunk); }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (!body || Object.keys(body).some(key => key !== "text") || typeof body.text !== "string" || !body.text.trim() || body.text.length > MAX_TASK_PARAGRAPH) return send(400, { error: "할 일을 1~2000자로 적어주세요." });
      text = body.text;
    } catch { return send(400, { error: "입력 내용을 확인해주세요." }); }
    // Recheck after the body read: concurrent requests may have acquired the slot.
    const latest = users.get(user) ?? { start: now(), count: 0 };
    if (running || latest.count >= 10 || globalCount >= 100) return send(429, { error: "AI가 사용 중이거나 요청 한도에 도달했어요. 잠시 후 다시 추가해주세요." });
    latest.count++; users.set(user, latest); globalCount++; running = true;
    const cancelled = new AbortController();
    const onClose = () => { if (!res.writableEnded) cancelled.abort(); };
    res.on("close", onClose);
    try {
      const titles = await generate(text, AbortSignal.any([cancelled.signal, AbortSignal.timeout(90000)]));
      send(200, { titles });
    } catch { send(503, { error: "PC의 AI가 응답하지 못했어요. 원문은 유지했으니 잠시 후 다시 추가해주세요." }); }
    finally { running = false; res.off("close", onClose); }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createGateway();
  server.requestTimeout = 105000;
  server.headersTimeout = 15000;
  server.listen(11436, "127.0.0.1", () => console.log("oddk AI gateway ready on loopback port 11436"));
}
