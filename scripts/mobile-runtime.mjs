import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
// Native ABI/config changes create a different compatibility group automatically.
// Normalize text so Windows and Linux produce the same version.
export function mobileRuntimeVersion() {
  const files = ["capacitor.config.ts", "mobile-updates.config.json", "android/app/build.gradle", "android/build.gradle", "android/variables.gradle"];
  function collect(dir, accept) {
    for (const entry of readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const file = `${dir}/${entry.name}`;
      if (entry.isDirectory() && entry.name !== "public" && entry.name !== "Assets.xcassets") collect(file, accept);
      else if (entry.isFile() && accept(file)) files.push(file);
    }
  }
  collect("android/app/src/main", file => /\.(java|kt)$/.test(file) || file.endsWith("AndroidManifest.xml"));
  collect("ios/App/App", file => /\.(swift|plist|xcprivacy)$/.test(file));
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  const plugins = Object.entries(pkg.dependencies).filter(([name]) => /^@(capacitor|capawesome)\//.test(name)).sort(([a], [b]) => a.localeCompare(b));
  const hash = createHash("sha256").update(JSON.stringify(plugins));
  for (const file of files.sort()) hash.update(`\0${file}\0${readFileSync(path.join(root, file), "utf8").replaceAll("\r\n", "\n")}`);
  return hash.digest("hex");
}
