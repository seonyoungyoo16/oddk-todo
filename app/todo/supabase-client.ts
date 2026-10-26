import { createClient } from "@supabase/supabase-js";
let client: ReturnType<typeof createClient> | undefined;
export function syncClient() {
  client ??= createClient("https://synxmskamifpovuziecx.supabase.co", "sb_publishable_ACwZjSLbL_dU9hilmAV7CQ_FEH8AT29", { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" } });
  return client;
}
