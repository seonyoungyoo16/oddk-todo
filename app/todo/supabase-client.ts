import { createClient } from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
const nativeStorage = {
  async getItem(key: string) { return (await Preferences.get({ key })).value; },
  async setItem(key: string, value: string) { await Preferences.set({ key, value }); },
  async removeItem(key: string) { await Preferences.remove({ key }); },
};
let client: ReturnType<typeof createClient> | undefined;
export function syncClient() {
  const native = Capacitor.isNativePlatform();
  client ??= createClient("https://synxmskamifpovuziecx.supabase.co", "sb_publishable_ACwZjSLbL_dU9hilmAV7CQ_FEH8AT29", { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: !native, flowType: "pkce", ...(native ? { storage: nativeStorage } : {}) } });
  return client;
}
