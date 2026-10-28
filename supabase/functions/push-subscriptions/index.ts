import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { createVapidKeys } from "../_shared/push-subscription.ts";
import { handlePushSubscription } from "./handler.ts";
import type { PushSubscriptionStore } from "./handler.ts";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false }, global: { fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(6000) }) },
});
const store: PushSubscriptionStore = {
  async config() {
    const { data, error } = await db.from("push_settings").select("public_key").eq("singleton", true).single();
    if (error) throw error;
    if (data.public_key) return { publicKey: data.public_key };
    const keys = await createVapidKeys();
    const result = await db.rpc("push_vapid_ensure", { p_public: keys.publicKey, p_private: keys.privateKey });
    if (result.error || typeof result.data !== "string") throw result.error ?? new Error("VAPID unavailable");
    return { publicKey: result.data };
  },
  async status(user, installation, binding) {
    const { data, error } = await db.rpc("push_device_status", { p_user: user, p_installation: installation, p_binding: binding });
    if (error) throw error; return data;
  },
  async devices(user) {
    const { data, error } = await db.rpc("push_device_list", { p_user: user });
    if (error) throw error; return data;
  },
  async revoke(user, installation, revision) {
    const { data, error } = await db.rpc("push_device_revoke", { p_user: user, p_installation: installation, p_revision: revision });
    if (error) throw error; return data;
  },
  async disable(user, installation, binding, revision) {
    const { data, error } = await db.rpc("push_device_disable", { p_user: user, p_installation: installation, p_binding: binding, p_revision: revision });
    if (error) throw error; return data;
  },
  async register(user, installation, binding, revision, label, subscription, endpointHash) {
    const { data, error } = await db.rpc("push_device_register", { p_user: user, p_installation: installation, p_binding: binding, p_revision: revision, p_label: label, p_endpoint: subscription.endpoint, p_endpoint_hash: endpointHash, p_p256dh: subscription.keys.p256dh, p_auth: subscription.keys.auth });
    if (error) throw error; return data;
  },
};
Deno.serve(req => handlePushSubscription(req, { store, authenticate: async token => {
  const { data, error } = await db.auth.getUser(token); return error ? null : data.user?.id ?? null;
} }));
