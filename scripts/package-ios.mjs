import { existsSync, mkdirSync, readdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { root, run } from "./mobile.mjs";

run(process.execPath, [path.join(root, "scripts/check-ios-project.mjs")]);
const files = [];
const excluded = new Set([".git", ".next", ".temp", "node_modules", "DerivedData", ".build", "build", "xcuserdata", "Pods"]);
function collect(relative) {
  const absolute = path.join(root, relative);
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    if (excluded.has(entry.name) || entry.name.startsWith(".env") || /\.(p12|mobileprovision|xcuserstate)$/.test(entry.name)) continue;
    const next = `${relative}/${entry.name}`;
    if (entry.isDirectory()) collect(next);
    else if (entry.isFile()) files.push(next);
  }
}
for (const folder of ["app", "public", "supabase/functions", "scripts", "tests", "ios"]) collect(folder);
// Xcode can resolve these native SPM plugins without installing Node on the Mac.
for (const plugin of ["app", "browser", "preferences"]) collect(`node_modules/@capacitor/${plugin}`);
collect("node_modules/@capawesome/capacitor-live-update");
for (const file of ["package.json", "package-lock.json", "tsconfig.json", "next.config.ts", "postcss.config.mjs", "eslint.config.mjs", "capacitor.config.ts", "mobile-updates.config.json", "MOBILE-UPDATES.md", "IOS.md", "ANDROID.md", "README.md", "AGENTS.md"]) if (existsSync(path.join(root, file))) files.push(file);
if (!files.includes("ios/App/App/public/todo/index.html")) throw Error("Run npm run ios:sync before packaging.");
const artifact = path.join(root, "artifacts/ios/oddk-ios-project.tar.gz");
mkdirSync(path.dirname(artifact), { recursive: true });
const list = path.join(root, ".sync-test-runtime/ios-package-files.txt");
mkdirSync(path.dirname(list), { recursive: true });
writeFileSync(list, files.sort().join("\n") + "\n");
run("tar", ["-czf", artifact, "-T", list]);
const hash = createHash("sha256").update(readFileSync(artifact)).digest("hex");
console.log(`iOS Xcode project + shared source: ${artifact}\n${files.length} files; SHA-256: ${hash}\nContains bundled web files and native plugin sources. No signing key, Apple account, environment secrets or app user data is included.`);
