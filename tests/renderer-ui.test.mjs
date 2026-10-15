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
  assert.match(main, /tab\.error = description \|\| "The page could not be loaded\."/);
  assert.match(main, /successfulNavigationClearsError/);
});

test("stopping a navigation clears the loading state", () => {
  assert.match(main, /contents\.on\("did-stop-loading", \(\) => \{[\s\S]*?tab\.loading = false;[\s\S]*?sendState\(\);[\s\S]*?\}\);/);
});
