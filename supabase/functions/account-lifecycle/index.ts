import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { handleLifecycle, LifecycleError, type Receipt } from "./handler.ts";
import { appleService } from "./apple.ts";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
const apple = appleService({ team: Deno.env.get("APPLE_TEAM_ID") ?? "", key: Deno.env.get("APPLE_KEY_ID") ?? "", privateKey: Deno.env.get("APPLE_PRIVATE_KEY") ?? "", client: Deno.env.get("APPLE_SERVICE_ID") ?? "" });
const origins = new Set(["https://seonyoungyoo16.github.io", "http://localhost:3000", "http://127.0.0.1:3200", "https://localhost", "capacitor://localhost"]);
async function receipt(hash: string): Promise<Receipt | null> {
  const result = await db.from("account_deletion_receipts").select("user_id").eq("operation_hash", hash).maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store", Vary: "Origin", ...(origin && origins.has(origin) ? { "Access-Control-Allow-Origin": origin } : {}), "Access-Control-Allow-Headers": "authorization, content-type, apikey", "Access-Control-Allow-Methods": "POST, OPTIONS" };
  const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers });
  if (origin && !origins.has(origin)) return reply({ error: "허용되지 않은 사이트예요." }, 403);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return reply({ error: "지원하지 않는 요청이에요." }, 405);
  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).length > 12000) return reply({ error: "요청이 너무 커요." }, 413);
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return reply({ error: "요청 형식을 확인해주세요." }, 400); }
    if (new URL(req.url).pathname.endsWith("/apple-notifications")) {
      const payload = body && typeof body === "object" && "payload" in body ? body.payload : null;
      if (typeof payload !== "string") return reply({ error: "Missing Apple signature" }, 400);
      let event;
      try { event = await apple.notification(payload); }
      catch (error) { return reply({ error: "Apple notification verification failed" }, error instanceof LifecycleError ? error.status : 401); }
      if (event.type === "consent-revoked" || event.type === "account-deleted") {
        const matches = await db.rpc("account_apple_notification_users", { p_subject: event.subject, p_event_time: event.time });
        if (matches.error) throw matches.error;
        for (const account of matches.data as Array<{ user_id: string }>) {
          const result = await db.auth.admin.deleteUser(account.user_id, false);
          if (result.error && result.error.status !== 404) throw result.error;
        }
      }
      // oddk sends no transactional email; forwarding changes require no email job.
      return reply({ processed: true });
    }
    const result = await handleLifecycle(body, req.headers.get("authorization")?.replace(/^Bearer /i, "") ?? "", {
      async authenticate(token) {
        const { data: { user }, error } = await db.auth.getUser(token);
        if (error || !user) return null;
        return { id: user.id, appleSubjects: (user.identities ?? []).filter(i => i.provider === "apple").map(i => String(i.identity_data?.sub ?? i.id)) };
      },
      receipt,
      async begin(hash, user) {
        const result = await db.from("account_deletion_receipts").upsert({ operation_hash: hash, user_id: user }, { onConflict: "operation_hash", ignoreDuplicates: true });
        if (result.error) throw result.error;
        const saved = await receipt(hash);
        if (!saved) throw Error("Receipt was not saved");
        return saved;
      },
      async tokens(user) {
        const result = await db.rpc("account_apple_tokens", { p_user: user });
        if (result.error) throw result.error;
        return result.data as string[];
      },
      async saveToken(user, token) {
        const result = await db.rpc("account_apple_token_save", { p_user: user, p_token: token });
        if (result.error) throw result.error;
      },
      validateAppleToken: apple.validate,
      revokeAppleToken: apple.revoke,
      appleReady: apple.ready,
      async deleteUser(user, token) {
        // Auth validates the caller above; never use a client-supplied user ID.
        const signout = await db.auth.admin.signOut(token, "global");
        if (signout.error && ![401, 403, 404].includes(signout.error.status ?? 0)) throw signout.error;
        const result = await db.auth.admin.deleteUser(user, false);
        if (result.error) throw result.error;
      },
    });
    return reply(result);
  } catch (error) {
    if (error instanceof LifecycleError) return reply({ error: error.message, code: error.code }, error.status);
    return reply({ error: "계정 처리를 완료하지 못했어요. 연결을 확인하고 다시 시도해주세요.", code: "server_error" }, 500);
  }
});
