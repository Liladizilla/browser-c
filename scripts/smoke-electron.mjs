import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import electronPath from "electron";

const startupWindowMs = 20_000;
const child = spawn(electronPath, ["--no-sandbox", "."], {
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, BROWSER_C_SMOKE: "1" }
});

let output = "";
child.stdout.setEncoding("utf8").on("data", (chunk) => { output += chunk; });
child.stderr.setEncoding("utf8").on("data", (chunk) => { output += chunk; });

const exitResult = new Promise((resolve) => {
  child.once("error", (error) => resolve({ error }));
  child.once("exit", (code, signal) => resolve({ code, signal }));
});

const result = await Promise.race([
  exitResult,
  new Promise((resolve) => setTimeout(() => resolve(null), startupWindowMs))
]);

if (result !== null) {
  throw new Error(
    `Electron exited during startup (code=${result.code ?? "unknown"}, signal=${result.signal ?? "none"}).
${result.error?.stack ?? output.slice(-6000)}`
  );
}

const uiSmokePassed = /BROWSER_C_UI_SMOKE_PASS/.test(output);
child.kill("SIGTERM");
assert.ok(uiSmokePassed, "Electron should render the browser chrome and expose the preload bridge.\n" + output.slice(-6000));
const shutdown = await Promise.race([
  exitResult,
  new Promise((resolve) => setTimeout(() => resolve("timeout"), 3_000))
]);
if (shutdown === "timeout") child.kill("SIGKILL");

assert.ok(true, "Electron remained running for the startup smoke-test window");
console.log("Electron startup smoke test passed.");
