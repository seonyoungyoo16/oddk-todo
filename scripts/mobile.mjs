import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { mobileRuntimeVersion } from "./mobile-runtime.mjs";

export const root = fileURLToPath(new URL("../", import.meta.url));
export const nativeEnv = { ...process.env, CAPACITOR_BUILD: "true", GITHUB_PAGES: "false" };
nativeEnv.NEXT_PUBLIC_MOBILE_RUNTIME = mobileRuntimeVersion();
nativeEnv.NEXT_PUBLIC_MOBILE_COMMIT = process.env.GITHUB_SHA ?? execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
export function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, env: nativeEnv, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
export function node(script, args) { run(process.execPath, [path.join(root, "node_modules", script), ...args]); }
export function buildNativeWeb() {
  node("next/dist/bin/next", ["build"]);
  const todo = path.join(root, "out-native/todo/index.html");
  if (!existsSync(todo)) throw Error("Native app entry /todo/ was not exported.");
  // Native extensionless routes must load Todo, not the web landing page.
  copyFileSync(todo, path.join(root, "out-native/index.html"));
}
export function syncNative(platform) {
  if (!["ios", "android"].includes(platform)) throw Error("Unsupported native platform.");
  const project = platform === "ios" ? "ios/App/App.xcodeproj/project.pbxproj" : "android/build.gradle";
  if (!existsSync(path.join(root, project))) node("@capacitor/cli/bin/capacitor", ["add", platform, ...(platform === "ios" ? ["--packagemanager", "SPM"] : [])]);
  node("@capacitor/cli/bin/capacitor", ["sync", platform]);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) buildNativeWeb();
