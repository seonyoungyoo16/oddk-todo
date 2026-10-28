import test from "node:test";
import assert from "node:assert/strict";
import { createECDH, createHmac, createDecipheriv, createPublicKey, verify } from "node:crypto";
import { encryptedSender } from "../../supabase/functions/push-worker/web-push.ts";
import { createVapidKeys } from "../../supabase/functions/_shared/push-subscription.ts";
const uuid = "00000000-0000-4000-8000-000000000001";
const payload = { v: 1, deliveryId: uuid, receiptToken: "a".repeat(64), userId: uuid, installationId: uuid, revision: 1, expiresAt: "2026-10-29T00:00:00.000Z" };
const endpoint = "https://fcm.googleapis.com/fcm/send/QA_never_sent";
const hmac = (key, data) => createHmac("sha256", key).update(data).digest();
const expand = (key, info, length) => hmac(key, Buffer.concat([info, Buffer.from([1])])).subarray(0, length);
// Independent RFC8291 one-record decryption, using platform crypto rather than
// the sending library's encryption helper, with synthetic receiver keys only.
function decrypt(body, receiver, auth) {
  const salt = body.subarray(0, 16), keyLength = body[20], serverKey = body.subarray(21, 21 + keyLength);
  assert.equal(keyLength, 65); assert.equal(body.readUInt32BE(16), 4096);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), receiver.getPublicKey(), serverKey]);
  const ikm = expand(hmac(auth, receiver.computeSecret(serverKey)), keyInfo, 32), prk = hmac(salt, ikm);
  const cek = expand(prk, Buffer.from("Content-Encoding: aes128gcm\0"), 16), nonce = expand(prk, Buffer.from("Content-Encoding: nonce\0"), 12);
  const ciphertext = body.subarray(21 + keyLength), decipher = createDecipheriv("aes-128-gcm", cek, nonce);
  decipher.setAuthTag(ciphertext.subarray(-16));
  const plain = Buffer.concat([decipher.update(ciphertext.subarray(0, -16)), decipher.final()]);
  let boundary = plain.length - 1; while (plain[boundary] === 0) boundary--;
  assert.equal(plain[boundary], 2); return JSON.parse(plain.subarray(0, boundary).toString("utf8"));
}
test("actual adapter encrypts a receipt, independently decrypts it, signs the expected VAPID audience and guards fetch", async () => {
  const keys = await createVapidKeys(), receiver = createECDH("prime256v1"); receiver.generateKeys();
  const auth = Buffer.alloc(16, 7), sub = { endpoint, keys: { p256dh: receiver.getPublicKey().toString("base64url"), auth: auth.toString("base64url") } }, requests = [];
  const sender = encryptedSender(async (url, options) => { requests.push({ url, options }); return new Response("provider body is ignored", { status: 201 }); });
  assert.deepEqual(await sender(sub, keys, payload, 110, "b".repeat(32)), { status: 201, retryAfter: null });
  const { url, options } = requests[0]; assert.equal(url, endpoint); assert.equal(options.redirect, "error"); assert.equal(options.method, "POST"); assert.ok(options.signal);
  assert.equal(options.headers.get("TTL"), "110"); assert.equal(options.headers.get("Topic"), "b".repeat(32)); assert.equal(options.headers.get("Content-Encoding"), "aes128gcm");
  const encrypted = Buffer.from(options.body); assert.deepEqual(decrypt(encrypted, receiver, auth), payload);
  assert.equal(encrypted.includes(Buffer.from(payload.receiptToken)), false); assert.equal(encrypted.includes(Buffer.from(keys.privateKey)), false);
  const authorization = options.headers.get("Authorization"), token = authorization.match(/t=([^, ]+)/)[1];
  const [header, claims, signature] = token.split("."), data = JSON.parse(Buffer.from(claims, "base64url").toString());
  assert.equal(data.aud, "https://fcm.googleapis.com"); assert.equal(data.sub, "https://seonyoungyoo16.github.io/oddk-todo/"); assert.ok(data.exp > Date.now() / 1000 && data.exp <= Date.now() / 1000 + 86400);
  const point = Buffer.from(keys.publicKey, "base64url"), key = createPublicKey({ format: "jwk", key: { kty: "EC", crv: "P-256", x: point.subarray(1, 33).toString("base64url"), y: point.subarray(33).toString("base64url") } });
  assert.equal(verify("sha256", Buffer.from(`${header}.${claims}`), { key, dsaEncoding: "ieee-p1363" }, Buffer.from(signature, "base64url")), true);
  await sender(sub, keys, payload, 110, "b".repeat(32)); assert.notDeepEqual(Buffer.from(requests[1].options.body), encrypted); assert.equal(requests[1].options.headers.get("Topic"), "b".repeat(32));
});
test("adapter rejects arbitrary destinations, extra text, invalid TTL/topic and never follows redirects", async () => {
  const keys = await createVapidKeys(), receiver = createECDH("prime256v1"); receiver.generateKeys();
  const sub = { endpoint, keys: { p256dh: receiver.getPublicKey().toString("base64url"), auth: Buffer.alloc(16, 1).toString("base64url") } }; let calls = 0;
  const sender = encryptedSender(async () => { calls++; return new Response(null, { status: 201 }); });
  for (const [subscription, message, ttl, topic] of [[{ ...sub, endpoint: "https://127.0.0.1/private" }, payload, 60, "b".repeat(32)], [sub, { ...payload, title: "Private text" }, 60, "b".repeat(32)], [sub, payload, 0, "b".repeat(32)], [sub, payload, 301, "b".repeat(32)], [sub, payload, 60, "bad topic"]]) await assert.rejects(() => sender(subscription, keys, message, ttl, topic));
  assert.equal(calls, 0);
  const redirect = encryptedSender(async (_url, options) => { assert.equal(options.redirect, "error"); throw new TypeError("redirect blocked"); });
  await assert.rejects(() => redirect(sub, keys, payload, 60, "b".repeat(32)));
});
