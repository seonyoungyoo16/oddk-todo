import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Exercise the Pages artifact, where a missing route becomes the live 404.
const base = "/oddk-todo";
for (const [route, heading, sibling] of [["privacy", "개인정보처리방침", "support"], ["support", "지원·문의", "privacy"]]) {
  const html = readFileSync(`out/${route}/index.html`, "utf8");
  assert.ok(html.includes(`<h1>${heading}</h1>`), `${route}: public content missing`);
  assert.ok(html.includes("유선영") && html.includes("seonyoungyoo16@gmail.com"), `${route}: operator/contact missing`);
  const links = [...html.matchAll(/\bhref="([^"]*)"/g)].map(match => match[1]);
  assert.ok(links.includes(`${base}/${sibling}/`), `${route}: sibling link misses Pages base path`);
  assert.ok(links.includes(`${base}/todo/`), `${route}: app link misses Pages base path`);
  assert.ok(links.some(link => link.startsWith("mailto:seonyoungyoo16@gmail.com")), `${route}: contact is not actionable`);
}
const home = readFileSync("out/index.html", "utf8");
for (const route of ["privacy", "support"]) assert.ok(home.includes(`href="${base}/${route}/"`), `Home does not link to ${route}`);
const app = readFileSync("out/todo/index.html", "utf8");
const helpGroups = [...app.matchAll(/<nav\b[^>]*aria-label="개인정보 및 지원"[^>]*>([\s\S]*?)<\/nav>/g)];
assert.equal(helpGroups.length, 3, "Account settings, profile and sync dialog must all expose help");
for (const title of ["profile-title", "sync-title"]) {
  const dialog = [...app.matchAll(/<dialog\b([^>]*)>([\s\S]*?)<\/dialog>/g)].find(([, attrs]) => attrs.includes(`aria-labelledby="${title}"`));
  assert.ok(dialog && dialog[2].includes('aria-label="개인정보 및 지원"'), `${title}: help navigation missing`);
}
for (const [index, group] of helpGroups.entries()) {
  for (const route of ["privacy", "support"]) assert.ok(group[1].includes(`href="${base}/${route}/"`), `App help ${index}: ${route} misses Pages base path`);
}
console.log("Public pages, contacts and all three app account/help entry points verified.");
