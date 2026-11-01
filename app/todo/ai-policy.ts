import { LOCAL_TASK_MODEL } from "./local-task-ai.ts";
export const AI_GATEWAY_ENDPOINT = "https://desktop-m9bcsrv.tailba6cb5.ts.net/split";
export const AI_MODEL = LOCAL_TASK_MODEL;
export const AI_PROCESSING_FACTS = {
  gateway: { endpoint: AI_GATEWAY_ENDPOINT, recipient: "oddk 운영자 유선영의 AI 게이트웨이와 PC", fields: "분석할 입력 문장·로그인 인증 토큰", purpose: "할 일 후보 생성", model: AI_MODEL, retention: "운영 로그·모델의 보관 기간 확인 중", authentication: "게이트웨이와 Supabase에서 토큰 확인, 모델 입력에는 미포함" },
  local: { endpoint: "http://127.0.0.1:11434/api/chat", recipient: "이 기기의 Ollama", fields: "분석할 입력 문장", purpose: "할 일 후보 생성", model: AI_MODEL, retention: "모델의 보관 기간 확인 중", authentication: "로그인 토큰 전송 없음" },
} as const;
