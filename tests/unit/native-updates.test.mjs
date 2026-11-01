import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, createHash, verify, sign } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { unzipSync } from "fflate";
import { packageMobileRelease } from "../../scripts/mobile-release.mjs";
import { verifyUpdateManifest, stageNativeUpdate } from "../../app/todo/native-update-policy.ts";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
const config = { appId: "com.oddk.todo", channel: "stable", manifestUrl: "https://example.invalid/mobile-updates/stable.json", publicKey };
const commit = "a".repeat(40), runtimeVersion = "b".repeat(64);
function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "oddk-update-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "web"), destination = path.join(root, "release");
  mkdirSync(path.join(source, "todo"), { recursive: true });
  for (const file of ["index.html", "todo/index.html"]) writeFileSync(path.join(source, file), "<main>새 할 일 화면</main>");
  const options = { source, destination, privateKey, config, commit, runtimeVersion };
  const result = packageMobileRelease(options);
  const envelope = JSON.parse(readFileSync(path.join(destination, "stable.json"), "utf8"));
  return { options, result, envelope };
}
test("CI archive and manifest signatures verify and contain the actual native Todo files", async t => {
  const f = fixture(t), archive = readFileSync(path.join(f.options.destination, `bundles/${f.result.bundleId}.zip`));
  const release = await verifyUpdateManifest(f.envelope, config, runtimeVersion);
  assert.equal(release.commit, commit);
  assert.equal(createHash("sha256").update(archive).digest("hex"), release.checksum);
  assert.equal(verify("sha256", archive, publicKey, Buffer.from(release.signature, "base64")), true);
  const tampered = Buffer.from(archive); tampered[15] ^= 1;
  assert.equal(verify("sha256", tampered, publicKey, Buffer.from(release.signature, "base64")), false);
  assert.match(new TextDecoder().decode(unzipSync(archive)["todo/index.html"]), /새 할 일/);
  assert.equal(packageMobileRelease(f.options).checksum, release.checksum, "reproducible archive");
});
test("tampered, unsigned, incompatible and redirected releases cannot reach the native downloader", async t => {
  const { envelope } = fixture(t);
  await assert.rejects(verifyUpdateManifest({ ...envelope, payload: envelope.payload.replace(commit, "c".repeat(40)) }, config, runtimeVersion), /signature/);
  await assert.rejects(verifyUpdateManifest({ payload: envelope.payload }, config, runtimeVersion), /signature/);
  await assert.rejects(verifyUpdateManifest(envelope, config, "c".repeat(64)), /Incompatible/);
  for (const changed of [{ appId: "other" }, { channel: "other" }, { url: "https://evil.invalid/bundle.zip" }, { bundleId: "../public" }]) {
    const payload = JSON.stringify({ ...JSON.parse(envelope.payload), ...changed });
    await assert.rejects(verifyUpdateManifest({ payload, signature: sign("sha256", Buffer.from(payload), privateKey).toString("base64") }, config, runtimeVersion));
  }
});
test("offline/checksum errors leave the working bundle selected; blocked bundles never retry", async t => {
  const { envelope } = fixture(t), release = await verifyUpdateManifest(envelope, config, runtimeVersion);
  const calls = [];
  const api = { getCurrentBundle: async () => ({ bundleId: null }), getNextBundle: async () => ({ bundleId: null }), getBlockedBundles: async () => ({ bundleIds: [] }), getBundles: async () => ({ bundleIds: [] }), downloadBundle: async () => { calls.push("download"); throw Error("offline/checksum"); }, setNextBundle: async () => calls.push("stage") };
  await assert.rejects(stageNativeUpdate(api, release, "old"), /offline/);
  assert.deepEqual(calls, ["download"]);
  calls.length = 0;
  api.getBlockedBundles = async () => ({ bundleIds: [release.bundleId] });
  assert.equal(await stageNativeUpdate(api, release, "old"), "blocked");
  assert.deepEqual(calls, []);
  api.getBlockedBundles = async () => ({ bundleIds: [] });
  api.downloadBundle = async () => calls.push("download");
  assert.equal(await stageNativeUpdate(api, release, "old"), "staged");
  assert.deepEqual(calls, ["download", "stage"]);
  calls.length = 0;
  assert.equal(await stageNativeUpdate(api, release, commit), "current");
  api.getCurrentBundle = async () => ({ bundleId: release.bundleId });
  assert.equal(await stageNativeUpdate(api, release, "old"), "current");
  assert.deepEqual(calls, []);
});
