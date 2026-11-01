import { SignJWT, generateKeyPair, exportPKCS8, exportJWK, createLocalJWKSet, jwtVerify } from "npm:jose@6.2.14";
import { appleService } from "../../supabase/functions/account-lifecycle/apple.ts";
const assert = (condition, message = "Assertion failed") => { if (!condition) throw Error(message); };
async function rejects(action) { let failed = false; try { await action(); } catch { failed = true; } assert(failed, "Expected rejection"); }
const client = "com.example.test.web";
const appleKey = await generateKeyPair("RS256");
const appKey = await generateKeyPair("ES256", { extractable: true });
const jwk = { ...await exportJWK(appleKey.publicKey), kid: "apple-test", alg: "RS256" };
const keys = createLocalJWKSet({ keys: [jwk] });
const config = { team: "TESTTEAM", key: "TESTKEY", client, privateKey: await exportPKCS8(appKey.privateKey) };
const identity = (subject = "apple-a", audience = client) => new SignJWT({}).setProtectedHeader({ alg: "RS256", kid: "apple-test" }).setIssuer("https://appleid.apple.com").setAudience(audience).setSubject(subject).setIssuedAt().setExpirationTime("5m").sign(appleKey.privateKey);
Deno.test("Apple refresh verifies subject, audience and app client-secret signature", async () => {
  let subject = "apple-a", audience = client;
  const calls = [];
  const service = appleService(config, async (url, options) => {
    calls.push(url);
    const body = options.body;
    const { payload } = await jwtVerify(body.get("client_secret"), appKey.publicKey, { issuer: config.team, audience: "https://appleid.apple.com", subject: client });
    assert(payload.exp - payload.iat === 300);
    assert(body.get("client_id") === client);
    if (url.endsWith("/revoke")) { assert(body.get("token") === "refresh"); return new Response(""); }
    assert(body.get("grant_type") === "refresh_token");
    return Response.json({ id_token: await identity(subject, audience) });
  }, keys);
  await service.validate("refresh", ["apple-a"]);
  await service.revoke("refresh");
  subject = "apple-other"; await rejects(() => service.validate("refresh", ["apple-a"]));
  subject = "apple-a"; audience = "other-client"; await rejects(() => service.validate("refresh", ["apple-a"]));
  assert(calls.every(url => url.startsWith("https://appleid.apple.com/auth/")));
});
Deno.test("missing Apple configuration and Apple rejection never pass revocation", async () => {
  const absent = appleService({ ...config, privateKey: "" }, async () => { throw Error("Must not fetch"); }, keys);
  assert(!absent.ready()); await rejects(() => absent.revoke("refresh"));
  const denied = appleService(config, async () => Response.json({ error: "invalid_grant" }, { status: 400 }), keys);
  await rejects(() => denied.revoke("refresh"));
});
Deno.test("notifications verify signature/audience and reject forged/future events", async () => {
  const service = appleService(config, fetch, keys);
  const now = Math.floor(Date.now() / 1000);
  const signed = (event, audience = client) => new SignJWT({ events: JSON.stringify(event) }).setProtectedHeader({ alg: "RS256", kid: "apple-test" }).setIssuer("https://appleid.apple.com").setAudience(audience).setIssuedAt().setJti(crypto.randomUUID()).sign(appleKey.privateKey);
  const event = { type: "consent-revoked", sub: "apple-a", event_time: now };
  const token = await signed(event);
  assert((await service.notification(token)).type === "consent-revoked");
  await rejects(() => service.notification(token.slice(0, -6) + "forged"));
  await rejects(async () => service.notification(await signed(event, "wrong-client")));
  await rejects(async () => service.notification(await signed({ ...event, event_time: now + 9999 })));
});
