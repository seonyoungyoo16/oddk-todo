// Authentication, Apple revocation and hard deletion stay on the server.
export type Account = { id: string; appleSubjects: string[] };
export type Receipt = { user_id: string | null };
export interface LifecycleServices {
  authenticate(token: string): Promise<Account | null>;
  receipt(hash: string): Promise<Receipt | null>;
  begin(hash: string, user: string): Promise<Receipt>;
  tokens(user: string): Promise<string[]>;
  saveToken(user: string, token: string): Promise<void>;
  validateAppleToken(token: string, subjects: string[]): Promise<void>;
  revokeAppleToken(token: string): Promise<void>;
  deleteUser(user: string, token: string): Promise<void>;
  appleReady(): boolean;
}
export class LifecycleError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(message: string, status = 400, code = "invalid_request") { super(message); this.status = status; this.code = code; }
}
export async function operationHash(operation: unknown) {
  if (typeof operation !== "string" || !/^[a-f0-9]{64}$/.test(operation)) throw new LifecycleError("삭제 요청 정보를 확인해주세요.");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(operation));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}
export async function handleLifecycle(body: unknown, bearer: string, services: LifecycleServices) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new LifecycleError("요청 형식을 확인해주세요.");
  const value = body as Record<string, unknown>;
  if (Object.keys(value).some(key => !["action", "operation", "confirmation", "refreshToken"].includes(key))) throw new LifecycleError("지원하지 않는 요청 항목이에요.");
  if (value.action === "capabilities") return { appleReady: services.appleReady() };
  if (value.action === "status") {
    const receipt = await services.receipt(await operationHash(value.operation));
    return { state: !receipt ? "unknown" : receipt.user_id === null ? "deleted" : "pending" };
  }
  const account = bearer ? await services.authenticate(bearer) : null;
  if (!account) throw new LifecycleError("로그인이 필요해요. 다시 로그인해주세요.", 401, "unauthorized");
  if (value.action === "apple-token") {
    if (!account.appleSubjects.length) throw new LifecycleError("Apple로 연결된 계정이 아니에요.", 403);
    if (typeof value.refreshToken !== "string" || value.refreshToken.length < 16 || value.refreshToken.length > 8192) throw new LifecycleError("Apple 인증 정보를 확인해주세요.");
    await services.validateAppleToken(value.refreshToken, account.appleSubjects);
    await services.saveToken(account.id, value.refreshToken);
    return { stored: true };
  }
  if (value.action !== "delete" || value.confirmation !== "DELETE_ACCOUNT") throw new LifecycleError("계정 삭제 확인이 필요해요.");
  const hash = await operationHash(value.operation);
  const before = await services.receipt(hash);
  if (before?.user_id === null) return { state: "deleted" };
  if (before && before.user_id !== account.id) throw new LifecycleError("다른 계정의 삭제 요청이에요.", 403);
  let tokens: string[] = [];
  if (account.appleSubjects.length) {
    if (!services.appleReady()) throw new LifecycleError("Apple 로그인 설정을 준비 중이에요.", 503, "apple_not_configured");
    tokens = await services.tokens(account.id);
    if (!tokens.length) throw new LifecycleError("Apple로 다시 로그인한 뒤 계정 삭제를 진행해주세요.", 409, "apple_reauthentication_required");
  }
  // Save before revocation: Apple's webhook may delete the Auth user immediately.
  const receipt = await services.begin(hash, account.id);
  if (receipt.user_id === null) return { state: "deleted" };
  if (receipt.user_id !== account.id) throw new LifecycleError("다른 계정의 삭제 요청이에요.", 403);
  try {
    for (const token of tokens) await services.revokeAppleToken(token);
    await services.deleteUser(account.id, bearer);
  } catch (error) {
    // The HTTP response can be lost after Auth commits the deletion.
    if ((await services.receipt(hash))?.user_id !== null) throw new LifecycleError(error instanceof LifecycleError && error.code === "apple_reauthentication_required" ? "Apple 인증 해제를 확인하지 못했어요. 원래 Apple 계정으로 다시 로그인한 뒤 같은 삭제 요청을 확인해주세요." : "삭제 결과를 확인 중이에요. 같은 요청으로 다시 확인해주세요.", 503, "deletion_pending");
  }
  if ((await services.receipt(hash))?.user_id !== null) throw new LifecycleError("삭제 결과를 확인 중이에요. 다시 확인해주세요.", 503, "deletion_pending");
  return { state: "deleted" };
}
