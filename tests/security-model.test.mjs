import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const main = await readFile(new URL("../src/main.js", import.meta.url), "utf8");
const preload = await readFile(new URL("../src/preload.cjs", import.meta.url), "utf8");
const chrome = await readFile(new URL("../src/renderer/index.html", import.meta.url), "utf8");

test("permissions are explicitly prompted and grants are session-scoped", () => {
  assert.match(main, /requestPermission\(origin, permission, browserSession\)/);
  assert.match(main, /Allow for this session/);
  assert.match(main, /permissionGrants/);
  assert.match(main, /safeOrigin\(origin\)/);
  assert.match(main, /callback\(false\)/);
  assert.match(main, /PERMISSION_LABELS\[permission\]/);
});
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

test("private tabs use isolated non-persistent sessions and clear their storage on close", () => {
  assert.match(main, /private-[" ]?\s*\+\s*randomUUID\(\)/);
  assert.match(main, /if\s*\(privateMode\)\s*privateSessions\.add\(view\.webContents\.session\)/);
  assert.match(main, /tab\.view\.webContents\.session\.clearStorageData\(\)/);
  assert.match(main, /tab\.view\.webContents\.session\.clearCache\(\)/);
});

test("risky download prompts default to cancellation and disclose no malware scan", () => {
  assert.match(main, /title:\s*"Potentially unsafe download"/);
  assert.match(main, /buttons:\s*\["Cancel download", "Continue to save"\]/);
  assert.match(main, /defaultId:\s*0/);
  assert.match(main, /Browser C does not scan downloaded files/);
  assert.match(main, /if\s*\(confirmation\.response !== 1\)\s*\{/);
});

test("private-mode smoke covers permission and download persistence boundaries", () => {
  assert.match(main, /privatePermissionGrantIsolated/);
  assert.match(main, /privateDownloadExcludedFromProfile/);
  assert.match(main, /permissionGrants\.set\(privateSession/);
  assert.match(main, /rememberCompletedDownload\(\{/);
  assert.match(main, /isPrivate:\s*true/);
});

test("background navigation smoke uses a unique failed URL to avoid cached failure state", () => {
  assert.match(main, /route === "\/fail" \|\| route === "\/fail-background"/);
  assert.match(main, /navigate\(fixtureOrigin \+ "\/fail-background", backgroundTab\.id\)/);
});
