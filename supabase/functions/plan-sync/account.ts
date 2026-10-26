import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { parsePlanRequest } from "./request.ts";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const origins = new Set(["https://seonyoungyoo16.github.io", "http://localhost:3000"]);
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store", "Vary": "Origin", ...(origin && origins.has(origin) ? { "Access-Control-Allow-Origin": origin } : {}), "Access-Control-Allow-Headers": "authorization, content-type, apikey", "Access-Control-Allow-Methods": "POST, OPTIONS" };
  const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });
  if (origin && !origins.has(origin)) return reply({ error: "허용되지 않은 사이트예요." }, 403);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return reply({ error: "지원하지 않는 요청이에요." }, 405);
  try {
    const token = req.headers.get("authorization")?.replace(/^Bearer /i, "");
    if (!token) return reply({ error: "로그인해주세요." }, 401);
    const { data: { user }, error: authError } = await db.auth.getUser(token);
    if (authError || !user) return reply({ error: "로그인이 만료됐어요. 다시 로그인해주세요." }, 401);
    const text = await req.text();
    const parsed = parsePlanRequest(text);
    if (!parsed.ok) return reply({ error: parsed.error }, parsed.status);
    const body = parsed.body;
    if (body.action === "ensure" || body.action === "pull") {
      let { data, error } = await db.from("account_plans").select("user_id,plan,version,updated_at").eq("user_id", user.id).maybeSingle();
      if (error) throw error;
      if (!data && body.action === "ensure") {
        const inserted = await db.from("account_plans").insert({ user_id: user.id, plan: body.plan }).select("user_id,plan,version,updated_at").single();
        if (inserted.error?.code === "23505") ({ data, error } = await db.from("account_plans").select("user_id,plan,version,updated_at").eq("user_id", user.id).single());
        else { data = inserted.data; error = inserted.error; }
        if (error) throw error;
      }
      return data ? reply({ id: user.id, plan: data.plan, version: data.version, updated_at: data.updated_at }) : reply({ error: "처음 로그인한 기기에서 데이터를 불러오는 중이에요." }, 404);
    }
    if (body.action === "push") {
      const { data, error } = await db.from("account_plans").update({ plan: body.plan, version: body.version + 1, updated_at: new Date().toISOString() }).eq("user_id", user.id).eq("version", body.version).select("plan,version,updated_at").maybeSingle();
      if (error) throw error;
      return data ? reply(data) : reply({ error: "다른 기기에서 먼저 변경했어요." }, 409);
    }
    return reply({ error: "지원하지 않는 요청이에요." }, 400);
  } catch (error) {
    // JSONB formatting can exceed the DB byte limit even below the raw request limit.
    if (error && typeof error === "object" && "code" in error && error.code === "23514") return reply({ error: "동기화할 데이터가 너무 커요." }, 413);
    return reply({ error: "서버에 저장하지 못했어요. 내용은 기기에 남아 있어요." }, 500);
  }
});
