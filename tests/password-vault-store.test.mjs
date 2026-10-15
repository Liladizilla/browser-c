import test from "node:test";
import assert from "node:assert/strict";
import { loadEncryptedPasswordVault } from "../src/password-vault-store.js";

const validEntry = {
  id: "entry-1",
  origin: "https://example.com",
  username: "person@example.com",
  password: "test-secret"
};

function options(overrides = {}) {
  return {
    filePath: "/profile/password-vault.enc",
    safeStorage: { decryptString: () => JSON.stringify([validEntry]) },
    readFile: async () => Buffer.from("encrypted"),
    backendAvailable: () => true,
    ...overrides
  };
}

test("a missing vault file starts a new empty vault", async () => {
  const error = Object.assign(new Error("missing"), { code: "ENOENT" });
  const result = await loadEncryptedPasswordVault(options({
    readFile: async () => { throw error; }
  }));
  assert.equal(result.available, true);
  assert.deepEqual(result.entries, []);
  assert.equal(result.error, "");
});

test("a decryption failure disables writes and preserves the existing vault", async () => {
  const result = await loadEncryptedPasswordVault(options({
    safeStorage: { decryptString: () => { throw new Error("decrypt failed"); } }
  }));
  assert.equal(result.available, false);
  assert.deepEqual(result.entries, []);
  assert.match(result.error, /existing vault file was preserved/i);
  assert.match(result.error, /saving is disabled/i);
});

test("malformed JSON is treated as vault damage rather than an empty vault", async () => {
  const result = await loadEncryptedPasswordVault(options({
    safeStorage: { decryptString: () => "{not-json" }
  }));
  assert.equal(result.available, false);
  assert.match(result.error, /preserved/i);
});

test("invalid entries fail closed instead of silently dropping saved credentials", async () => {
  const result = await loadEncryptedPasswordVault(options({
    safeStorage: { decryptString: () => JSON.stringify([validEntry, { id: "broken" }]) }
  }));
  assert.equal(result.available, false);
  assert.deepEqual(result.entries, []);
  assert.match(result.error, /invalid data/i);
});

test("a valid encrypted vault loads entries and respects the configured limit", async () => {
  const result = await loadEncryptedPasswordVault(options({
    safeStorage: { decryptString: () => JSON.stringify([validEntry, { ...validEntry, id: "entry-2" }]) },
    maxEntries: 1
  }));
  assert.equal(result.available, true);
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].id, "entry-1");
  assert.equal(result.error, "");
});

test("unexpected file read errors disable the vault and preserve the file", async () => {
  const result = await loadEncryptedPasswordVault(options({
    readFile: async () => { throw new Error("permission denied"); }
  }));
  assert.equal(result.available, false);
  assert.match(result.error, /existing file was preserved/i);
});
