import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { root } from "./mobile.mjs";

// Use the same pinned parsers as Capacitor's project synchronization.
const require = createRequire(path.join(root, "node_modules/@capacitor/cli/package.json"));
const plist = require("plist"), xcode = require("xcode");
const read = file => readFileSync(path.join(root, file), "utf8");
const info = plist.parse(read("ios/App/App/Info.plist"));
assert.equal(info.CFBundleDisplayName, "oddk");
assert.ok(info.CFBundleURLTypes.some(type => type.CFBundleURLSchemes.includes("com.oddk.todo")), "App auth scheme must be registered");
assert.equal(info.UIViewControllerBasedStatusBarAppearance, true);
assert.ok(info.UIApplicationSceneManifest.UISceneConfigurations.UIWindowSceneSessionRoleApplication.some(scene => scene.UISceneDelegateClassName.endsWith(".SceneDelegate")), "UIScene delegate must handle native auth callbacks");
assert.notEqual(info.NSAppTransportSecurity?.NSAllowsArbitraryLoads, true);
const privacy = plist.parse(read("ios/App/App/PrivacyInfo.xcprivacy"));
assert.equal(privacy.NSPrivacyTracking, false);
assert.ok(privacy.NSPrivacyAccessedAPITypes.some(api => api.NSPrivacyAccessedAPIType === "NSPrivacyAccessedAPICategoryUserDefaults" && api.NSPrivacyAccessedAPITypeReasons.includes("CA92.1")));
const project = xcode.project(path.join(root, "ios/App/App.xcodeproj/project.pbxproj"));
project.parseSync();
const objects = project.hash.project.objects;
const manifestRef = Object.entries(objects.PBXFileReference).find(([, value]) => value.path === "PrivacyInfo.xcprivacy")?.[0];
const manifestBuild = Object.entries(objects.PBXBuildFile).find(([, value]) => value.fileRef === manifestRef)?.[0];
assert.ok(manifestRef && manifestBuild && Object.values(objects.PBXResourcesBuildPhase).some(value => value.files?.some(file => file.value === manifestBuild)), "Privacy manifest must belong to the app resources");
assert.match(read("ios/App/App/SceneDelegate.swift"), /SceneDelegateProxy\.shared\.scene\(scene, openURLContexts: URLContexts\)/);
const spm = read("ios/App/CapApp-SPM/Package.swift");
assert.match(spm, /exact: "8\.6\.0"/);
for (const plugin of ["CapacitorApp", "CapacitorBrowser", "CapacitorPreferences", "CapacitorLocalNotifications", "CapawesomeCapacitorLiveUpdate"]) assert.ok(spm.includes(plugin), `Missing SPM plugin ${plugin}`);
const icon = readFileSync(path.join(root, "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"));
assert.equal(icon.readUInt32BE(16), 1024); assert.equal(icon.readUInt32BE(20), 1024);
assert.ok(![4, 6].includes(icon[25]), "App icon must be opaque RGB PNG");
if (existsSync(path.join(root, "ios/App/App/capacitor.config.json"))) {
  const config = JSON.parse(read("ios/App/App/capacitor.config.json"));
  assert.equal(config.appId, "com.oddk.todo"); assert.equal(config.webDir, "out-native");
  assert.equal(config.server.appStartPath, "/todo/"); assert.equal(config.server.url, undefined);
  assert.equal(config.loggingBehavior, "none");
  assert.equal(read("ios/App/App/public/index.html"), read("ios/App/App/public/todo/index.html"));
}
console.log("iOS project check passed: Xcode project, callback scheme, scene lifecycle, privacy resource, SPM plugins, icon and bundled Todo entry. Native compilation is a separate check on Mac.");
