import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const executable = process.env.BROWSER_C_EXECUTABLE || "browser-c";
const timeoutMs = 60_000;
const child = spawn(executable, ["--no-sandbox"], {
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, BROWSER_C_SMOKE: "1" }
});

let output = "";
const append = (chunk) => {
  output += chunk.toString();
  if (/BROWSER_C_UI_SMOKE_(?:PASS|FAIL)/.test(output)) finish();
};
child.stdout.on("data", append);
child.stderr.on("data", append);

let finished = false;
let timer;
let resolveDone;
const done = new Promise((resolve) => { resolveDone = resolve; });
function finish() {
  if (finished) return;
  finished = true;
  clearTimeout(timer);
  resolveDone();
}
child.once("error", (error) => {
  output += "\n" + error.stack;
  finish();
});
child.once("exit", (code, signal) => {
  if (!finished) {
    output += `\nInstalled Browser C exited before UI smoke completion (code=${code}, signal=${signal}).`;
    finish();
  }
});
timer = setTimeout(() => {
  output += `\nInstalled Browser C UI smoke timed out after ${timeoutMs}ms.`;
  finish();
}, timeoutMs);

await done;
child.kill("SIGTERM");
await new Promise((resolve) => {
  if (child.exitCode !== null || child.signalCode !== null) return resolve();
  const killTimer = setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 2_000);
  child.once("exit", () => { clearTimeout(killTimer); resolve(); });
});

assert.match(output, /BROWSER_C_UI_SMOKE_PASS/, "Installed Browser C must render and pass UI smoke checks.\n" + output.slice(-10_000));
assert.match(output, /BROWSER_C_NAVIGATION_SMOKE_PASS/, "Installed Browser C must pass navigation controls.\n" + output.slice(-10_000));
assert.match(output, /BROWSER_C_NAVIGATION_ERROR_RECOVERY_PASS/, "Installed Browser C must recover from navigation errors.\n" + output.slice(-10_000));
assert.match(output, /BROWSER_C_REDIRECT_SMOKE_PASS/, "Installed Browser C must follow redirects.\n" + output.slice(-10_000));
assert.match(output, /BROWSER_C_PRIVATE_SESSION_ISOLATION_PASS/, "Installed Browser C must preserve private-session isolation.\n" + output.slice(-10_000));
assert.match(output, /BROWSER_C_BACKGROUND_ERROR_ISOLATION_PASS/, "Installed Browser C must isolate inactive-tab errors.\n" + output.slice(-10_000));
assert.match(output, /BROWSER_C_OFFLINE_RECOVERY_PASS/, "Installed Browser C must recover after a refused connection.\n" + output.slice(-10_000));
assert.match(output, /BROWSER_C_RENDERER_CRASH_RECOVERY_PASS/, "Installed Browser C must recover from renderer crashes.\n" + output.slice(-10_000));
console.log("Installed Debian Browser C passed the Electron UI and integration smoke suite.");
