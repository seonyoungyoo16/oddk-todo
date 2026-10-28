import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { handleTravelRequest } from "./handler.ts";
import type { LookupStore } from "./handler.ts";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const store: LookupStore = {
  async get(key) {
    const { data, error } = await db.from("travel_lookup_cache").select("payload,expires_at").eq("cache_key", key).maybeSingle();
    if (error) throw error;
    return data ? { payload: data.payload, expiresAt: data.expires_at } : null;
  },
  async put(key, provider, payload, fetchedAt, expiresAt) {
    const result = await db.from("travel_lookup_cache").upsert({ cache_key: key, provider, payload, fetched_at: fetchedAt, expires_at: expiresAt });
    if (result.error) throw result.error;
    const cleanup = await db.from("travel_lookup_cache").delete().lt("expires_at", fetchedAt);
    if (cleanup.error) throw cleanup.error;
  },
  async claim(provider) {
    const { data, error } = await db.rpc("travel_claim_lookup", { p_provider: provider });
    if (error) throw error;
    return data && typeof data.id === "string" && typeof data.validUntil === "string" ? { id: data.id, validUntil: data.validUntil } : null;
  },
  async finish(provider, lease) {
    const { error } = await db.rpc("travel_finish_lookup", { p_provider: provider, p_lease: lease });
    if (error) throw error;
  },
};
Deno.serve(req => handleTravelRequest(req, { store, fetcher: fetch, now: () => new Date(), enabled: Deno.env.get("TRAVEL_LOOKUP_DISABLED") !== "true" }));
