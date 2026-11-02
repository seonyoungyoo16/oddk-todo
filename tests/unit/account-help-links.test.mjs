import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const app = fileURLToPath(new URL("../../app/todo/", import.meta.url));
// Render the real consumers and JSX; replace only auth/OS/side-effect boundaries.
function components(state) {
  const cache = new Map();
  const store = { getSyncSnapshot: () => JSON.stringify(state), getServerSyncSnapshot: () => JSON.stringify(state), subscribeSync: () => () => {}, getPlanScope: () => "fixture" };
  const boundary = new Proxy({}, { get: (_, key) => key === "__esModule" ? true : () => null });
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const compiledModule = { exports: {} }, realRequire = createRequire(file);
    cache.set(file, compiledModule.exports);
    const compiled = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
    const require = spec => spec === "./sync-store" ? store : spec === "./native-reminder-settings" ? { DeviceReminderSettings: () => null, useNativeReminderStatus: () => ({ native: false }) } : spec === "./account-help-links" ? load(resolve(dirname(file), "account-help-links.tsx")) : spec.startsWith(".") ? boundary : realRequire(spec);
    new Function("require", "module", "exports", compiled)(require, compiledModule, compiledModule.exports);
    return compiledModule.exports;
  }
  return { SyncPanel: load(resolve(app, "sync-panel.tsx")).SyncPanel, SettingsPanel: load(resolve(app, "settings-panel.tsx")).SettingsPanel };
}

for (const base of ["", "/oddk-todo"]) for (const connected of [false, true]) {
  test(`account help survives ${connected ? "connected" : "anonymous"} state at ${base || "root"}`, () => {
    const previous = process.env.NEXT_PUBLIC_BASE_PATH;
    process.env.NEXT_PUBLIC_BASE_PATH = base;
    try {
      const { SyncPanel, SettingsPanel } = components({ connected, phase: connected ? "synced" : "local", provider: "google", name: "fixture", message: "fixture" });
      const sync = renderToStaticMarkup(React.createElement(SyncPanel, { fallback: "{}" }));
      const settings = renderToStaticMarkup(React.createElement(SettingsPanel, { plan: {}, onSave: () => true, theme: "light", onThemeChange: () => {}, fallback: "{}" }));
      for (const title of ["profile-title", "sync-title"]) {
        const dialog = [...sync.matchAll(/<dialog\b([^>]*)>([\s\S]*?)<\/dialog>/g)].find(([, attrs]) => attrs.includes(`aria-labelledby="${title}"`));
        assert.ok(dialog, `Missing ${title}`);
        assert.equal([...dialog[2].matchAll(/aria-label="개인정보 및 지원"/g)].length, 1, `${title} must have exactly one help navigation`);
      }
      for (const [markup, expected] of [[sync, 2], [settings, 1]]) {
        const groups = [...markup.matchAll(/<nav\b[^>]*aria-label="개인정보 및 지원"[^>]*>([\s\S]*?)<\/nav>/g)];
        assert.equal(groups.length, expected);
        for (const [, group] of groups) for (const route of ["privacy", "support"]) assert.ok(group.includes(`href="${base}/${route}/"`));
      }
      if (connected && readFileSync(resolve(app, "sync-panel.tsx"), "utf8").includes("AccountDeletionDialog")) assert.ok(sync.includes("계정 삭제"), "Existing account deletion action must remain");
    } finally { if (previous === undefined) delete process.env.NEXT_PUBLIC_BASE_PATH; else process.env.NEXT_PUBLIC_BASE_PATH = previous; }
  });
}
