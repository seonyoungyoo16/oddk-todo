import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
test("Apple setup generates a signed scoped secret without printing private values", () => {
  const folder = realpathSync(mkdtempSync(path.join(tmpdir(), "oddk-apple-config-")));
  const key = generateKeyPairSync("ec", { namedCurve: "prime256v1", privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
  const keyPath = path.join(folder, "AuthKey.p8");
  writeFileSync(keyPath, key.privateKey);
  try {
    const output = execFileSync(process.execPath, [fileURLToPath(new URL("../../scripts/configure-apple-login.mjs", import.meta.url)), "--team", "TEAM123456", "--key", "KEY1234567", "--service", "com.example.test.web", "--private-key", keyPath], { cwd: folder, encoding: "utf8" });
    const generated = path.join(folder, ".sync-test-runtime/apple-login");
    const token = readFileSync(path.join(generated, "oauth-secret.txt"), "utf8");
    const [header, payload, signature] = token.split(".");
    const claims = JSON.parse(Buffer.from(payload, "base64url"));
    assert.equal(claims.iss, "TEAM123456"); assert.equal(claims.sub, "com.example.test.web"); assert.equal(claims.exp - claims.iat, 180 * 86400);
    assert.equal(verify("sha256", Buffer.from(`${header}.${payload}`), { key: key.publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(signature, "base64url")), true);
    assert.equal(output.includes(token), false); assert.equal(output.includes(key.privateKey), false);
    const env = readFileSync(path.join(generated, "secrets.env"), "utf8");
    assert.equal(JSON.parse(env.split("\n").find(line => line.startsWith("APPLE_PRIVATE_KEY=")).slice("APPLE_PRIVATE_KEY=".length)), key.privateKey);
  } finally {
    // Only the exact directory created by this test is recursively removed.
    assert.equal(path.basename(folder).startsWith("oddk-apple-config-"), true);
    assert.equal(path.dirname(folder).toLowerCase(), realpathSync(tmpdir()).toLowerCase());
    rmSync(folder, { recursive: true, force: true });
  }
});
