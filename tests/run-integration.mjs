import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const fixture = new URL("../.sync-auth-fixture.json", import.meta.url);
if (!existsSync(fixture)) {
  console.error("Integration fixtures missing: prepare two isolated test accounts in .sync-auth-fixture.json. See tests/README.md. No tests ran.");
  process.exit(1);
}
try {
  const users = JSON.parse(readFileSync(fixture, "utf8"));
  if (!Array.isArray(users) || users.length !== 2 || users.some((user) => !user?.id || !user.email || !user.password)) throw new Error();
} catch {
  console.error("Integration fixture is invalid. Expected two isolated { id, email, password } accounts. No tests ran.");
  process.exit(1);
}
for (const file of ["account-sync.test.mjs", "account-store.test.mjs", "account-schema.test.mjs"]) {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL(file, import.meta.url))], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
