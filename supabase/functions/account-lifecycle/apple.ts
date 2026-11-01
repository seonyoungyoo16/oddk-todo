import { SignJWT, importPKCS8, jwtVerify, createRemoteJWKSet } from "npm:jose@6.2.14";
import type { JWTVerifyGetKey } from "npm:jose@6.2.14";
import { LifecycleError } from "./handler.ts";
const appleKeys = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));
export type AppleConfig = { team: string; key: string; privateKey: string; client: string };
export function appleService(config: AppleConfig, request: typeof fetch = fetch, keys: JWTVerifyGetKey = appleKeys) {
  const ready = () => Object.values(config).every(Boolean);
  async function clientSecret() {
    if (!ready()) throw new LifecycleError("Apple 로그인 설정을 준비 중이에요. 문의 이메일로 연락해주세요.", 503, "apple_not_configured");
    const key = await importPKCS8(config.privateKey.replace(/\\n/g, "\n"), "ES256");
    return new SignJWT({}).setProtectedHeader({ alg: "ES256", kid: config.key }).setIssuer(config.team).setAudience("https://appleid.apple.com").setSubject(config.client).setIssuedAt().setExpirationTime("5m").sign(key);
  }
  async function post(path: string, token: string) {
    const body = new URLSearchParams({ client_id: config.client, client_secret: await clientSecret(), token, token_type_hint: "refresh_token" });
    if (path === "token") { body.delete("token"); body.delete("token_type_hint"); body.set("refresh_token", token); body.set("grant_type", "refresh_token"); }
    const response = await request(`https://appleid.apple.com/auth/${path}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, signal: AbortSignal.timeout(10000), redirect: "error" });
    if (!response.ok) {
      // Invalid/expired credentials require a fresh Apple login, never silent deletion.
      throw new LifecycleError("Apple 인증을 확인하지 못했어요. Apple로 다시 로그인한 뒤 시도해주세요.", 409, "apple_reauthentication_required");
    }
    return response;
  }
  return {
    ready,
    async notification(payload: string) {
      if (!ready()) throw new LifecycleError("Apple notifications are not configured", 503);
      const { payload: claims } = await jwtVerify(payload, keys, { issuer: "https://appleid.apple.com", audience: config.client, algorithms: ["RS256"], requiredClaims: ["iat", "jti"] });
      const event = typeof claims.events === "string" ? JSON.parse(claims.events) : claims.events;
      if (!event || typeof event !== "object" || !["consent-revoked", "account-deleted", "email-enabled", "email-disabled"].includes(event.type) || typeof event.sub !== "string" || event.sub.length > 255 || !Number.isSafeInteger(event.event_time) || event.event_time < 1 || event.event_time > Date.now() / 1000 + 300 || typeof claims.iat !== "number" || claims.iat > Date.now() / 1000 + 300) throw new LifecycleError("Invalid Apple notification");
      return { type: event.type as string, subject: event.sub as string, time: event.event_time as number };
    },
    async validate(token: string, subjects: string[]) {
      const result = await (await post("token", token)).json();
      if (typeof result.id_token !== "string") throw new LifecycleError("Apple 인증 결과를 확인하지 못했어요.", 502);
      const { payload } = await jwtVerify(result.id_token, keys, { issuer: "https://appleid.apple.com", audience: config.client, algorithms: ["RS256"], requiredClaims: ["exp", "sub", "iat"] });
      if (!payload.sub || !subjects.includes(payload.sub)) throw new LifecycleError("현재 계정과 다른 Apple 인증이에요.", 403);
    },
    async revoke(token: string) { await post("revoke", token); },
  };
}
