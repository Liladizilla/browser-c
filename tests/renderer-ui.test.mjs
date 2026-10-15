import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [main, html, css, renderer] = await Promise.all([
  readFile(new URL("../src/main.js", import.meta.url), "utf8"),
  readFile(new URL("../src/renderer/index.html", import.meta.url), "utf8"),
  readFile(new URL("../src/renderer/styles.css", import.meta.url), "utf8"),
  readFile(new URL("../src/renderer/renderer.js", import.meta.url), "utf8")
]);

test("browser chrome uses a compact shared toolbar height", () => {
  assert.match(main, /CHROME_HEIGHT = 136/);
  assert.match(css, /\.toolbar[^\n]*height: 136px/);
  assert.match(css, /top: 136px; left: 12px/);
});

test("find-in-page overlays the toolbar instead of reserving a permanent row", () => {
  assert.match(css, /\.find-bar \{ position: absolute/);
  assert.match(html, /id="find-bar" class="find-bar" hidden/);
});

test("private tabs are visually distinct and announce their privacy state", () => {
  assert.match(renderer, /tab\.isPrivate \? " private-tab" : ""/);
  assert.match(css, /\.tab\.private-tab\.active/);
  assert.match(renderer, /aria-label", "Private tab: "/);
  assert.match(renderer, /Private session · history and tabs are not saved/);
});

test("narrow window breakpoints preserve usable toolbar controls", () => {
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /@media \(max-width: 520px\)/);
  assert.match(css, /#home \{ display: none; \}/);
});

test("minimum window width makes the narrow responsive layout reachable and smoke-tested", () => {
  assert.match(main, /minWidth: 520/);
  assert.match(main, /Responsive layout overflow at 520px/);
  assert.match(css, /@media \(max-width: 520px\)/);
});

test("search provider selector is accessible and wired to persistent settings", () => {
  assert.match(html, /label class="search-provider-label" for="search-provider"/);
  assert.match(html, /option value="duckduckgo"/);
  assert.match(renderer, /api\.setSearchProvider\(searchProviderSelect\.value\)/);
  assert.match(main, /browser:settings:search-provider/);
  assert.match(main, /searchProvider: profile\.searchProvider/);
});

test("site permission controls stay disabled until the active site has temporary grants", () => {
  assert.match(html, /id="clear-site-permissions"[^>]*disabled>Site access<\/button>/);
  assert.match(renderer, /clearSitePermissions\.disabled = sitePermissions\.length === 0/);
  assert.match(renderer, /api\.clearSitePermissions\(\)/);
  assert.match(main, /browser:permissions:clear-site/);
  assert.match(main, /grants\.delete\(permissionKey\(origin, permission\)\)/);
  assert.match(main, /function permissionKey\(origin, permission\) \{ return new URL\(origin\)\.origin/);
});

test("tab list supports arrow and boundary keyboard navigation", () => {
  assert.match(renderer, /\["ArrowLeft", "ArrowRight", "Home", "End"\]/);
  assert.match(renderer, /api\.activateTab\(Number\(nextTab\.dataset\.tabId\)\)/);
  assert.match(renderer, /setAttribute\("data-tab-id", String\(tab\.id\)\)/);
});


test("navigation history uses the supported Electron navigationHistory API", () => {
  assert.match(main, /navigationHistory\.canGoBack\(\)/);
  assert.match(main, /navigationHistory\.canGoForward\(\)/);
  assert.match(main, /navigationHistory\.goBack\(\)/);
  assert.match(main, /navigationHistory\.goForward\(\)/);
  assert.doesNotMatch(main, /\.webContents\.canGoBack\(\)|\.webContents\.canGoForward\(\)/);
});

test("navigation start and successful load clear stale navigation errors", () => {
  assert.match(main, /did-start-navigation[\s\S]{0,180}sendState\(\{ error: "" \}\)/);
  assert.match(main, /did-finish-load[\s\S]{0,180}sendState\(\{ error: "" \}\)/);
  assert.match(main, /did-fail-load[\s\S]{0,200}code !== -3/);
});


test("navigation errors are stored per tab and cleared on a new or successful navigation", () => {
  assert.match(main, /error: tab\.error \|\| ""/);
  assert.match(main, /tab\.loading = true; tab\.error = ""; sendState\(\{ error: "" \}\)/);
  assert.match(main, /tab\.error = navigationErrorMessage\(code, description\)/);
  assert.match(main, /successfulNavigationClearsError/);
});

test("stopping a navigation clears the loading state", () => {
  assert.match(main, /contents\.on\("did-stop-loading", \(\) => \{[\s\S]*?tab\.loading = false;[\s\S]*?sendState\(\);[\s\S]*?\}\);/);
});


test("failed navigation exposes an accessible retry action and hides it after recovery", () => {
  assert.match(html, /id="retry-navigation"[^>]*type="button" hidden>Retry<\/button>/);
  assert.match(renderer, /retryNavigation\.hidden = !state\.error/);
  assert.match(renderer, /retryNavigation\.disabled = Boolean\(state\.loading\)/);
  assert.match(renderer, /retryNavigation\.addEventListener\("click"/);
  assert.match(css, /\.retry-navigation\[hidden\] \{ display: none; \}/);
  assert.match(renderer, /async function submitAddress\(event\)/);
});

test("frameless browser chrome exposes working native window-control IPC actions", () => {
  assert.match(main, /backgroundColor: "#101214", frame: false/);
  assert.match(html, /id="window-minimize"/);
  assert.match(html, /id="window-maximize"/);
  assert.match(html, /id="window-close"/);
  assert.match(renderer, /api\.minimizeWindow\(\)/);
  assert.match(renderer, /api\.toggleMaximizeWindow\(\)/);
  assert.match(renderer, /api\.closeWindow\(\)/);
  assert.match(main, /browser:window:minimize/);
  assert.match(main, /browser:window:toggle-maximize/);
  assert.match(main, /browser:window:close/);
  assert.match(main, /isTrustedChromeEvent/);
});

test("page tools expose print, complete-page save, and detached developer tools", () => {
  assert.match(html, /id="print-page"/);
  assert.match(html, /id="save-page-as"/);
  assert.match(html, /id="open-devtools"/);
  assert.match(renderer, /api\.printPage\(\)/);
  assert.match(renderer, /api\.savePageAs\(\)/);
  assert.match(renderer, /api\.openDevTools\(\)/);
  assert.match(main, /webContents\.print\(/);
  assert.match(main, /webContents\.savePage\(result\.filePath, "HTMLComplete"\)/);
  assert.match(main, /webContents\.openDevTools\(\{ mode: "detach" \}\)/);
});
