import test from "node:test";
import assert from "node:assert/strict";
import { resolveAddress, isWebUrl } from "../src/navigation.js";

test("empty address opens the default home page", () => {
  assert.equal(resolveAddress("  "), "https://www.google.com/");
});
test("explicit HTTP and HTTPS URLs are preserved and normalized", () => {
  assert.equal(resolveAddress("https://example.com/a"), "https://example.com/a");
  assert.equal(resolveAddress("http://example.com"), "http://example.com/");
});
test("domain names receive HTTPS by default", () => {
  assert.equal(resolveAddress("example.com"), "https://example.com/");
});
test("plain text becomes an encoded search query", () => {
  assert.equal(resolveAddress("cats and dogs"), "https://www.google.com/search?q=cats%20and%20dogs");
});
test("localhost addresses are accepted for development", () => {
  assert.equal(resolveAddress("localhost:3000"), "http://localhost:3000/");
});
test("local file URLs are not considered web URLs", () => {
  assert.equal(isWebUrl("file:///etc/passwd"), false);
});
test("HTTP and HTTPS are the only permitted navigation schemes", () => {
  assert.equal(isWebUrl("https://example.com"), true);
  assert.equal(isWebUrl("http://example.com"), true);
  assert.equal(isWebUrl("file:///tmp/page.html"), false);
  assert.throws(() => resolveAddress("ftp://example.com"));
});
