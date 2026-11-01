import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { root, nativeEnv as env, run, buildNativeWeb, syncNative } from "./mobile.mjs";

const mode = process.argv[2] ?? "debug";
if (!["web", "sync", "debug"].includes(mode)) throw Error("Use web, sync or debug.");
buildNativeWeb();
if (mode === "web") process.exit(0);
syncNative("android");
if (mode === "sync") process.exit(0);

if (!env.ANDROID_HOME && !env.ANDROID_SDK_ROOT && process.platform === "win32" && env.LOCALAPPDATA) {
  const sdk = path.join(env.LOCALAPPDATA, "Android/Sdk");
  if (existsSync(sdk)) env.ANDROID_HOME = sdk;
}
if (!env.JAVA_HOME) {
  const java = spawnSync("java", ["-XshowSettings:properties", "-version"], { encoding: "utf8", env });
  env.JAVA_HOME = `${java.stdout ?? ""}${java.stderr ?? ""}`.match(/java\.home\s*=\s*(.+)/)?.[1].trim();
}
if (process.platform === "win32") run("cmd.exe", ["/d", "/c", "gradlew.bat", "assembleDebug", "--console=plain"], path.join(root, "android"));
else run("./gradlew", ["assembleDebug", "--console=plain"], path.join(root, "android"));
const apk = path.join(root, "artifacts/android/oddk-debug.apk");
mkdirSync(path.dirname(apk), { recursive: true });
copyFileSync(path.join(root, "android/app/build/outputs/apk/debug/app-debug.apk"), apk);
console.log(`\nAPK: ${apk}\nSHA-256: ${createHash("sha256").update(readFileSync(apk)).digest("hex")}`);
