// Generates private local setup files only. Never prints or uploads signing keys.
import { createPrivateKey, sign } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
const args = Object.fromEntries(Array.from({ length: (process.argv.length - 2) / 2 }, (_, i) => [process.argv[2 + i * 2], process.argv[3 + i * 2]]));
const team = args["--team"], kid = args["--key"], service = args["--service"], keyPath = args["--private-key"];
if (!/^[A-Z0-9]{10}$/.test(team ?? "") || !/^[A-Z0-9]{10}$/.test(kid ?? "") || !/^[a-zA-Z0-9][a-zA-Z0-9.-]{5,254}$/.test(service ?? "") || !keyPath) {
  throw Error("Usage: node scripts/configure-apple-login.mjs --team TEAM_ID --key KEY_ID --service SERVICES_ID --private-key C:/private/AuthKey.p8");
}
const pem = readFileSync(keyPath, "utf8");
const key = createPrivateKey(pem);
if (key.asymmetricKeyType !== "ec" || key.asymmetricKeyDetails?.namedCurve !== "prime256v1") throw Error("Expected an Apple P-256 private key");
const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
const now = Math.floor(Date.now() / 1000), expires = now + 180 * 86400;
const unsigned = `${encode({ alg: "ES256", kid })}.${encode({ iss: team, iat: now, exp: expires, aud: "https://appleid.apple.com", sub: service })}`;
const secret = `${unsigned}.${sign("sha256", Buffer.from(unsigned), { key, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
const folder = path.resolve(".sync-test-runtime/apple-login");
mkdirSync(folder, { recursive: true });
writeFileSync(path.join(folder, "oauth-secret.txt"), secret, { mode: 0o600 });
writeFileSync(path.join(folder, "secrets.env"), `APPLE_TEAM_ID=${team}\nAPPLE_KEY_ID=${kid}\nAPPLE_SERVICE_ID=${service}\nAPPLE_PRIVATE_KEY=${JSON.stringify(pem)}\n`, { mode: 0o600 });
console.log(`Private setup files: ${folder}\nOAuth secret expires: ${new Date(expires * 1000).toISOString()}\nValues were not printed or uploaded. Keep these files and the .p8 key private.`);
