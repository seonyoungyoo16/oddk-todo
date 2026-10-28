import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { handlePushReceipt } from "./handler.ts";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false }, global: { fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(6000) }) },
});
Deno.serve(req => handlePushReceipt(req, { now: () => new Date(), store: {
  async authorize(body, receiptHash, bindingHash, action) {
    const { data, error } = await db.rpc("push_receipt_authorize", { p_id: body.deliveryId, p_receipt_hash: receiptHash, p_binding_hash: bindingHash,
      p_installation: body.installationId, p_user: body.userId, p_revision: body.revision, p_action: action });
    if (error) throw error; return data;
  },
} }));
