import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import electronPath from "electron";

const startupWindowMs = 45_000;
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

const smokeCompletion = new Promise((resolve) => {
  const check = () => {
    if (!/BROWSER_C_UI_SMOKE_(?:PASS|FAIL)/.test(output)) return;
    child.stdout.off("data", check);
    child.stderr.off("data", check);
    resolve("completed");
  };
  child.stdout.on("data", check);
  child.stderr.on("data", check);
  check();
});

let timeoutHandle;
const timeout = new Promise((resolve) => {
  timeoutHandle = setTimeout(() => resolve({ kind: "timeout" }), startupWindowMs);
});
const result = await Promise.race([
  exitResult.then((exit) => ({ kind: "exit", exit })),
  smokeCompletion.then(() => ({ kind: "smoke" })),
  timeout
]);
clearTimeout(timeoutHandle);

if (result.kind === "exit") {
  throw new Error(
    `Electron exited before the smoke suite completed (code=${result.exit.code ?? "unknown"}, signal=${result.exit.signal ?? "none"}).
${result.exit.error?.stack ?? output.slice(-8000)}`
  );
}
if (result.kind === "timeout") {
  child.kill("SIGTERM");
  throw new Error(`Electron did not complete the UI smoke suite within ${startupWindowMs}ms.
${output.slice(-8000)}`);
}

const uiSmokePassed = /BROWSER_C_UI_SMOKE_PASS/.test(output);
const navigationSmokePassed = /BROWSER_C_NAVIGATION_SMOKE_PASS/.test(output);
const navigationRecoveryPassed = /BROWSER_C_NAVIGATION_ERROR_RECOVERY_PASS/.test(output);
const redirectSmokePassed = /BROWSER_C_REDIRECT_SMOKE_PASS/.test(output);
const privateSessionIsolationPassed = /BROWSER_C_PRIVATE_SESSION_ISOLATION_PASS/.test(output);
const backgroundErrorIsolationPassed = /BROWSER_C_BACKGROUND_ERROR_ISOLATION_PASS/.test(output);\nconst offlineRecoveryPassed = /BROWSER_C_OFFLINE_RECOVERY_PASS/.test(output);\nconst rendererCrashRecoveryPassed = /BROWSER_C_RENDERER_CRASH_RECOVERY_PASS/.test(output);
child.kill("SIGTERM");
assert.ok(uiSmokePassed, "Electron should render browser chrome and pass UI interactions.\\n" + output.slice(-8000));
assert.ok(navigationSmokePassed, "Electron should pass back/forward/reload/stop integration checks.\\n" + output.slice(-8000));
assert.ok(navigationRecoveryPassed, "Electron should show failed-navigation feedback and clear it after recovery.\\n" + output.slice(-8000));
assert.ok(redirectSmokePassed, "Electron should follow redirects to their final destination.\\n" + output.slice(-8000));
assert.ok(privateSessionIsolationPassed, "Electron should prove private session isolation, storage cleanup, and persistence exclusions.\\n" + output.slice(-8000));
assert.ok(backgroundErrorIsolationPassed, "Navigation errors in an inactive tab should not overwrite the active tab state.\\n" + output.slice(-8000));\nassert.ok(offlineRecoveryPassed, "A refused network connection should show an error and recover after successful navigation.\\n" + output.slice(-8000));\nassert.ok(rendererCrashRecoveryPassed, "A crashed page renderer should show recovery feedback and reload successfully.\\n" + output.slice(-8000));
const shutdown = await Promise.race([
  exitResult,
  new Promise((resolve) => setTimeout(() => resolve("timeout"), 3_000))
]);
if (shutdown === "timeout") child.kill("SIGKILL");

console.log("Electron startup smoke test passed.");
