import test from "node:test";
import assert from "node:assert/strict";
import { resolveAddress, isWebUrl, navigationErrorMessage } from "../src/navigation.js";

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
test("plain-text searches use the selected provider", () => {
  assert.equal(resolveAddress("cats and dogs", "duckduckgo"), "https://duckduckgo.com/?q=cats%20and%20dogs");
  assert.equal(resolveAddress("cats and dogs", "bing"), "https://www.bing.com/search?q=cats%20and%20dogs");
  assert.equal(resolveAddress("cats and dogs", "brave"), "https://search.brave.com/search?q=cats%20and%20dogs");
  assert.equal(resolveAddress("cats and dogs", "unknown"), "https://www.google.com/search?q=cats%20and%20dogs");
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

test("certificate errors are explained without suggesting an insecure bypass", () => {
  assert.match(navigationErrorMessage(-202, "net::ERR_CERT_AUTHORITY_INVALID"), /certificate is not trusted/i);
  assert.match(navigationErrorMessage(-201, "net::ERR_CERT_DATE_INVALID"), /expired or not yet valid/i);
  assert.match(navigationErrorMessage(-200, "net::ERR_CERT_COMMON_NAME_INVALID"), /does not match this address/i);
  assert.match(navigationErrorMessage(-207, "net::ERR_CERT_INVALID"), /certificate is invalid/i);
  assert.doesNotMatch(navigationErrorMessage(-202, "net::ERR_CERT_AUTHORITY_INVALID"), /proceed anyway|ignore|bypass/i);
});

test("common offline and DNS failures produce useful recovery guidance", () => {
  assert.match(navigationErrorMessage(-106, "net::ERR_INTERNET_DISCONNECTED"), /offline/i);
  assert.match(navigationErrorMessage(-105, "net::ERR_NAME_NOT_RESOLVED"), /address could not be found/i);
  assert.match(navigationErrorMessage(-102, "net::ERR_CONNECTION_REFUSED"), /refused the connection/i);
  assert.match(navigationErrorMessage(-999, ""), /check the address and your network/i);
});
