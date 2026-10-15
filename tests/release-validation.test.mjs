import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const validator = fileURLToPath(new URL("../scripts/validate-release.mjs", import.meta.url));

async function runValidator(platform, artifactNames, manifestFactory) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "browser-c-release-validation-"));
  try {
    const hashes = new Map();
    for (const name of artifactNames) {
      const bytes = Buffer.from("test artifact: " + name);
      await writeFile(path.join(directory, name), bytes);
      hashes.set(name, createHash("sha256").update(bytes).digest("hex"));
    }
    const manifest = manifestFactory
      ? manifestFactory(hashes)
      : [...hashes].map(([name, hash]) => `${hash}  ${name}`).join("\n") + "\n";
    await writeFile(path.join(directory, "SHA256SUMS.txt"), manifest);
    return spawnSync(process.execPath, [validator, platform, directory], { encoding: "utf8" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("release validator accepts required Linux formats with matching checksums", async () => {
  const result = await runValidator("linux", ["Browser-C.AppImage", "Browser-C.deb"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Release validation passed for linux: 2 artifact/);
});

test("release validator rejects a missing required package format", async () => {
  const result = await runValidator("linux", ["Browser-C.AppImage"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Expected a \.deb package/);
});

test("release validator rejects checksum mismatches", async () => {
  const result = await runValidator("windows", ["Browser-C.exe"], () => "0".repeat(64) + "  Browser-C.exe\n");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Checksum mismatch for Browser-C\.exe/);
});

test("release validator rejects malformed checksum records", async () => {
  const result = await runValidator("macos", ["Browser-C.dmg", "Browser-C.zip"], () => "not-a-checksum  Browser-C.dmg\n");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Malformed checksum line/);
});

test("release validator rejects duplicate checksum entries", async () => {
  const result = await runValidator("windows", ["Browser-C.exe"], (hashes) => {
    const hash = hashes.get("Browser-C.exe");
    return `${hash}  Browser-C.exe\n${hash}  Browser-C.exe\n`;
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Duplicate checksum entry/);
});

test("release validator rejects artifacts omitted from the checksum manifest", async () => {
  const result = await runValidator("macos", ["Browser-C.dmg", "Browser-C.zip"], (hashes) =>
    `${hashes.get("Browser-C.dmg")}  Browser-C.dmg\n`);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Checksum manifest must cover every artifact exactly once/);
});
