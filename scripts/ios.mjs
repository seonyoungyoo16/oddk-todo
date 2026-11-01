import path from "node:path";
import { root, run, buildNativeWeb, syncNative } from "./mobile.mjs";

const mode = process.argv[2] ?? "sync";
if (!["sync", "simulator", "archive"].includes(mode)) throw Error("Use sync, simulator or archive.");
if (mode !== "sync" && process.platform !== "darwin") throw Error("iOS compilation requires a Mac with Xcode 26+. Use npm run ios:sync on Windows, then open the project on your Mac.");
buildNativeWeb();
syncNative("ios");
run(process.execPath, [path.join(root, "scripts/check-ios-project.mjs")]);
if (mode === "sync") process.exit(0);
const common = ["-project", "ios/App/App.xcodeproj", "-scheme", "App"];
if (mode === "simulator") {
  run("xcodebuild", [...common, "-configuration", "Debug", "-sdk", "iphonesimulator", "-destination", "generic/platform=iOS Simulator", "-derivedDataPath", path.join(root, "artifacts/ios/DerivedData"), "CODE_SIGNING_ALLOWED=NO", "build"]);
  console.log("Simulator app: artifacts/ios/DerivedData/Build/Products/Debug-iphonesimulator/App.app");
} else {
  const team = process.env.APPLE_TEAM_ID;
  if (team && !/^[A-Z0-9]{10}$/.test(team)) throw Error("APPLE_TEAM_ID must be a 10-character Apple development team ID.");
  run("xcodebuild", [...common, "-configuration", "Release", "-destination", "generic/platform=iOS", "-archivePath", path.join(root, "artifacts/ios/oddk.xcarchive"), ...(team ? [`DEVELOPMENT_TEAM=${team}`] : []), "archive"]);
}
