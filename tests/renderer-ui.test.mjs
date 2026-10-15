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

test("tab list supports arrow and boundary keyboard navigation", () => {
  assert.match(renderer, /\["ArrowLeft", "ArrowRight", "Home", "End"\]/);
  assert.match(renderer, /api\.activateTab\(Number\(nextTab\.dataset\.tabId\)\)/);
  assert.match(renderer, /setAttribute\("data-tab-id", String\(tab\.id\)\)/);
});
