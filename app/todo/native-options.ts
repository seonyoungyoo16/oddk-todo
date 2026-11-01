export const NATIVE_AUTH_REDIRECT = "com.oddk.todo://auth/callback";

/** Capacitor's localhost belongs to the phone, not the development PC. */
export function usesLocalTaskAI(hostname: string, native: boolean) {
  return !native && ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
}

export function nativeAuthCallback(raw: string): { code: string; flowId?: string } | { error: true } | null {
  if (raw.length > 16384) return null;
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== "com.oddk.todo:" || url.host !== "auth" || url.pathname !== "/callback" || url.username || url.password || url.hash) return null;
  if (url.searchParams.has("error")) return { error: true };
  const codes = url.searchParams.getAll("code"), flowIds = url.searchParams.getAll("sb_flow_id");
  if (codes.length !== 1 || !codes[0].trim() || codes[0].length > 4096 || flowIds.length > 1 || flowIds.some(id => !id || id.length > 256)) return { error: true };
  return { code: codes[0], ...(flowIds.length ? { flowId: flowIds[0] } : {}) };
}

/** Android can deliver the same callback through both launch URL and appUrlOpen. */
export function createNativeAuthHandler(exchange: (code: string, flowId?: string) => Promise<void>) {
  const handled = new Set<string>();
  return async (raw: string) => {
    const callback = nativeAuthCallback(raw);
    if (!callback) return false;
    if ("error" in callback) throw Error("로그인을 완료하지 못했어요. 다시 로그인해주세요.");
    if (handled.has(callback.code)) return true;
    handled.add(callback.code);
    if (handled.size > 16) handled.delete(handled.values().next().value!);
    await exchange(callback.code, callback.flowId);
    return true;
  };
}
