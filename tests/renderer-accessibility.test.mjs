import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const rendererDirectory = new URL("../src/renderer/", import.meta.url);
const htmlPath = fileURLToPath(new URL("index.html", rendererDirectory));
const rendererPath = fileURLToPath(new URL("renderer.js", rendererDirectory));

test("library controls expose their panel relationship and initial collapsed state", async () => {
  const html = await readFile(htmlPath, "utf8");
  for (const id of ["show-bookmarks", "show-history", "show-downloads"]) {
    const button = html.match(new RegExp(`<button id="${id}"[^>]*>`))?.[0];
    assert.ok(button, `missing ${id} button`);
    assert.match(button, /aria-controls="library-panel"/);
    assert.match(button, /aria-expanded="false"/);
  }
  assert.match(html, /id="library-panel"[^>]*aria-labelledby="library-title"/);
  assert.match(html, /id="library-title"/);
});

test("library open and close keep expanded state synchronized and restore focus", async () => {
  const renderer = await readFile(rendererPath, "utf8");
  assert.match(renderer, /trigger\.setAttribute\("aria-expanded", String\(mode === triggerMode\)\)/);
  assert.match(renderer, /trigger\.setAttribute\("aria-expanded", "false"\)/);
  assert.match(renderer, /closeLibrary\.focus\(\)/);
  assert.match(renderer, /libraryTrigger\?\.focus\(\)/);
});

test("find-in-page controls are exposed as a named search region", async () => {
  const html = await readFile(htmlPath, "utf8");
  assert.match(html, /id="find-bar"[^>]*role="search" aria-label="Find in page"/);
});
