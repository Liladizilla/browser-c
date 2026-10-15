import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const main = await readFile(new URL("../src/main.js", import.meta.url), "utf8");
const preload = await readFile(new URL("../src/preload.cjs", import.meta.url), "utf8");
const chrome = await readFile(new URL("../src/renderer/index.html", import.meta.url), "utf8");

test("remote page views use sandboxing and context isolation", () => {
  assert.match(main, /contextIsolation:\s*true/);
  assert.match(main, /nodeIntegration:\s*false/);
  assert.match(main, /sandbox:\s*true/);
  assert.match(main, /webSecurity:\s*true/);
});
test("remote popups and web permissions are denied by default", () => {
  assert.match(main, /setWindowOpenHandler\(\(\) => \(\{ action: "deny" \}\)\)/);
  assert.match(main, /setPermissionRequestHandler/);
  assert.match(main, /setPermissionCheckHandler/);
  assert.match(main, /will-redirect/);
  assert.match(main, /chromeUrl/);
});
test("preload exposes a narrow bridge rather than raw IPC", () => {
  assert.match(preload, /contextBridge\.exposeInMainWorld/);
  assert.doesNotMatch(preload, /exposeInMainWorld\([^,]+,\s*ipcRenderer/);
});
test("local chrome has a restrictive content security policy", () => {
  assert.match(chrome, /Content-Security-Policy/);
  assert.match(chrome, /object-src 'none'/);
  assert.match(chrome, /connect-src 'none'/);
});
