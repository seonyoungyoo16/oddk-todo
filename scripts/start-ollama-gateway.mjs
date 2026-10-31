import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, openSync } from "node:fs";

const runtime = join(process.env.LOCALAPPDATA, "oddk-ai");
mkdirSync(runtime, { recursive: true });
const log = openSync(join(runtime, "gateway.log"), "a");
const folder = dirname(fileURLToPath(import.meta.url));
let child = null, checking = false, ollamaStarting = false;
async function healthy(url, service) {
  try { const response = await fetch(url, { signal: AbortSignal.timeout(3000) }); if (!response.ok) return false; return !service || (await response.json()).service === service; }
  catch { return false; }
}
async function check() {
  if (checking) return;
  checking = true;
  try {
    if (!ollamaStarting && !await healthy("http://127.0.0.1:11434/api/tags")) {
      ollamaStarting = true;
      const ollama = spawn(join(process.env.LOCALAPPDATA, "Programs", "Ollama", "ollama.exe"), ["serve"], { windowsHide: true, stdio: "ignore" });
      ollama.on("error", () => { ollamaStarting = false; });
      ollama.on("exit", () => { ollamaStarting = false; });
    }
    if (!child && !await healthy("http://127.0.0.1:11436/health", "oddk-task-ai")) {
      child = spawn(process.execPath, [join(folder, "ollama-gateway.mjs")], { windowsHide: true, stdio: ["ignore", log, log] });
      child.on("error", () => { child = null; });
      child.on("exit", () => { child = null; });
    }
  } finally { checking = false; }
}
void check();
setInterval(() => void check(), 10000);
