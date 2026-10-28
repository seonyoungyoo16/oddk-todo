import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url), out = new URL("../out/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.webmanifest", out), "utf8"));
assert.equal(manifest.display, "standalone"); assert.equal(manifest.lang, "ko");
for (const prefix of ["https://example.invalid/", "https://example.invalid/oddk-todo/"]) {
  const url = new URL("manifest.webmanifest", prefix);
  assert.equal(new URL(manifest.start_url, url).href, new URL("todo/", prefix).href);
  assert.equal(new URL(manifest.scope, url).href, prefix);
  for (const icon of manifest.icons) assert.equal(new URL(icon.src, url).origin, url.origin);
}
for (const size of [192, 512]) {
  assert.ok(manifest.icons.some(icon => icon.src === `./oddk-icon-${size}.png` && icon.sizes === `${size}x${size}`));
  const png = readFileSync(new URL(`oddk-icon-${size}.png`, out));
  assert.equal(png.readUInt32BE(16), size); assert.equal(png.readUInt32BE(20), size);
}
for (const name of ["oddk-push-sw.js", "oddk-push-core.js"]) assert.deepEqual(readFileSync(new URL(name, out)), readFileSync(new URL(`public/${name}`, root)));
const html = readFileSync(new URL("todo/index.html", out), "utf8");
assert.ok(html.includes('lang="ko"'));
assert.ok(html.includes("/oddk-todo/manifest.webmanifest")); assert.ok(html.includes("/oddk-todo/oddk-icon-192.png"));
function inspect(directory, base = directory) {
  for (const file of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, file.name), name = relative(base, path).replaceAll("\\", "/");
    assert.equal(/(?:^|\/)(?:ux\d+-.*qa|.*fixture.*|\.sync-.*)(?:\/|$)/i.test(name), false, `QA artifact in export: ${name}`);
    if (file.isDirectory()) inspect(path, base);
    else if (/\.(?:html|js|json|webmanifest)$/.test(name)) assert.equal(readFileSync(path, "utf8").includes("oddk-verification-"), false, `Test account in export: ${name}`);
  }
}
inspect(fileURLToPath(out));
console.log("PASS: static SW source equality, standalone manifest local/Pages paths, PNG sizes, HTML links/language, no QA/fixture export.");
