import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { handleExecution } from "../../supabase/functions/execution/handler.ts";
import { handleTravelRequest } from "../../supabase/functions/travel-lookup/handler.ts";

function planHandler() {
  let handler;
  const source = readFileSync(new URL("../../supabase/functions/plan-sync/account.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const client = { auth: { getUser: async () => ({ data: { user: null }, error: null }) } };
  vm.runInNewContext(code, { exports: {}, require: () => ({ createClient: () => client }), Deno: { env: { get: () => "synthetic" }, serve: callback => { handler = callback; } }, Set, Request, Response, Error });
  return handler;
}
const request = (origin, method = "OPTIONS") => new Request("https://example.invalid", { method, headers: { Origin: origin, "Content-Type": "application/json" }, ...(method === "POST" ? { body: "{}" } : {}) });
test("native preflight reaches plan, execution and travel endpoints without weakening foreign-origin gates", async () => {
  const plan = planHandler();
  const handlers = [plan, req => handleExecution(req, { authenticate: async () => { throw Error("Unexpected auth"); }, store: {} }), req => handleTravelRequest(req, { enabled: false })];
  for (const handle of handlers) {
    for (const origin of ["https://localhost", "capacitor://localhost", "https://seonyoungyoo16.github.io"]) {
      const result = await handle(request(origin));
      assert.equal(result.status, 204); assert.equal(result.headers.get("access-control-allow-origin"), origin);
    }
    for (const origin of ["https://localhost.evil.example", "capacitor://localhost.evil.example", "null"]) {
      const result = await handle(request(origin));
      assert.equal(result.status, 403); assert.equal(result.headers.get("access-control-allow-origin"), null);
    }
  }
  for (const origin of ["https://localhost", "capacitor://localhost"]) {
    assert.equal((await plan(request(origin, "POST"))).status, 401);
    assert.equal((await handleExecution(request(origin, "POST"), { authenticate: async () => null, store: {} })).status, 401);
  }
});
