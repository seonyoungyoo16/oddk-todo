import test from "node:test";
import assert from "node:assert/strict";
// Run in a separate Deno test process from the normal crypto adapter test.
test("unsafe encryption key logging refuses module startup before loading the sending library", async () => {
  globalThis.Deno.env.set("ECE_KEYLOG", "1");
  try { await assert.rejects(() => import("../../supabase/functions/push-worker/web-push.ts"), /Unsafe encryption logging configuration/); }
  finally { globalThis.Deno.env.delete("ECE_KEYLOG"); }
});
