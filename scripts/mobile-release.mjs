import { createHash, createPublicKey, sign, verify } from "node:crypto";
import { readFileSync, readdirSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { zipSync } from "fflate";
import { mobileRuntimeVersion } from "./mobile-runtime.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
export function packageMobileRelease({ source, destination, config, privateKey, commit, runtimeVersion }) {
  if (!/^[a-f0-9]{40}$/.test(commit) || !/^[a-f0-9]{64}$/.test(runtimeVersion)) throw Error("A full commit SHA and runtime version are required");
  if (!privateKey) throw Error("MOBILE_UPDATE_SIGNING_KEY is required; an unsigned release cannot be published");
  if (createPublicKey(privateKey).export({ type: "spki", format: "pem" }) !== config.publicKey) throw Error("Signing key does not match the public key embedded in apps");
  if (!existsSync(path.join(source, "todo/index.html")) || readFileSync(path.join(source, "index.html"), "utf8") !== readFileSync(path.join(source, "todo/index.html"), "utf8")) throw Error("Build the native Todo bundle first");
  const files = {};
  function collect(dir = "") {
    for (const entry of readdirSync(path.join(source, dir), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith(".") || /\.(map|pem|p12|mobileprovision)$/.test(entry.name) || entry.isSymbolicLink()) throw Error(`Unexpected mobile asset: ${entry.name}`);
      const relative = dir ? `${dir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) collect(relative);
      else if (entry.isFile()) files[relative] = [new Uint8Array(readFileSync(path.join(source, relative))), { mtime: new Date("2020-01-01T00:00:00Z") }];
    }
  }
  collect();
  const archive = Buffer.from(zipSync(files, { level: 9 }));
  const checksum = createHash("sha256").update(archive).digest("hex");
  const bundleId = `${commit.slice(0, 12)}-${checksum.slice(0, 12)}`;
  const signature = sign("sha256", archive, privateKey).toString("base64");
  if (!verify("sha256", archive, config.publicKey, Buffer.from(signature, "base64"))) throw Error("Bundle signature verification failed");
  const release = { schemaVersion: 1, appId: config.appId, channel: config.channel, runtimeVersion, bundleId, url: new URL(`bundles/${bundleId}.zip`, config.manifestUrl).href, checksum, signature, commit };
  const payload = JSON.stringify(release);
  const envelope = { payload, signature: sign("sha256", Buffer.from(payload), privateKey).toString("base64") };
  mkdirSync(path.join(destination, "bundles"), { recursive: true });
  writeFileSync(path.join(destination, `bundles/${bundleId}.zip`), archive);
  writeFileSync(path.join(destination, `${config.channel}.json`), JSON.stringify(envelope) + "\n");
  return { bundleId, checksum, runtimeVersion, bytes: archive.length, files: Object.keys(files).length, commit };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = packageMobileRelease({ source: path.join(root, "out-native"), destination: path.join(root, "out/mobile-updates"), config: JSON.parse(readFileSync(path.join(root, "mobile-updates.config.json"), "utf8")), privateKey: process.env.MOBILE_UPDATE_SIGNING_KEY, commit: process.env.GITHUB_SHA, runtimeVersion: mobileRuntimeVersion() });
  console.log(JSON.stringify(result, null, 2));
}
