import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import postcss from "postcss";

const css = postcss.parse(readFileSync(new URL("../../app/todo/styles/tokens.css", import.meta.url), "utf8"));
function theme(dark) {
  const values = {};
  css.walkRules(rule => {
    if (rule.parent.type !== "root" || rule.selector.includes('[data-theme="dark"]') && !dark) return;
    rule.walkDecls(declaration => { values[declaration.prop] = declaration.value; });
  });
  const resolve = name => values[name]?.startsWith("var(") ? resolve(values[name].slice(4, -1)) : values[name];
  return resolve;
}
function luminance(hex) {
  const raw = hex.slice(1), expanded = raw.length === 3 ? [...raw].map(value => value + value).join("") : raw;
  const rgb = [0, 2, 4].map(index => parseInt(expanded.slice(index, index + 2), 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}
for (const dark of [false, true]) test(`design text contrast remains readable in ${dark ? "dark" : "light"} theme`, () => {
  const resolve = theme(dark);
  const pairs = [["heading", "surface"], ["muted", "surface"], ["muted", "soft"], ["brand-foreground", "brand"], ["accent-text", "highlight"], ["success-text", "success-surface"], ["danger-text", "danger-surface"], ["editor-heading", "editor-field"]];
  for (const [foreground, background] of pairs) {
    const a = luminance(resolve(`--oddk-${foreground}`)), b = luminance(resolve(`--oddk-${background}`));
    const ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    assert.ok(ratio >= 4.5, `${foreground}/${background}: ${ratio.toFixed(2)}:1 is below 4.5:1`);
  }
});
