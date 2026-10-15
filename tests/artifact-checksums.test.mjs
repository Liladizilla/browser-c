import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { writeChecksums } from "../scripts/write-checksums.mjs";

test("writes deterministic SHA-256 checksums for each artifact", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "browser-c-checksums-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const first = Buffer.from("installer bytes");
  const second = Buffer.from("archive bytes");
  await writeFile(path.join(directory, "Browser-C.exe"), first);
  await writeFile(path.join(directory, "Browser-C.zip"), second);

  const manifest = await writeChecksums(directory);
  const expected = [
    createHash("sha256").update(first).digest("hex") + "  Browser-C.exe",
    createHash("sha256").update(second).digest("hex") + "  Browser-C.zip"
  ].join("\n") + "\n";
  assert.equal(manifest, expected);
  assert.equal(await readFile(path.join(directory, "SHA256SUMS.txt"), "utf8"), expected);
});

test("refuses to publish a checksum manifest for an empty artifact directory", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "browser-c-empty-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await assert.rejects(writeChecksums(directory), /No package artifacts found/);
});

test("does not include the manifest in its own checksum list", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "browser-c-repeat-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(path.join(directory, "Browser-C.AppImage"), "package");
  await writeFile(path.join(directory, "SHA256SUMS.txt"), "stale manifest");
  const manifest = await writeChecksums(directory);
  assert.match(manifest, /Browser-C\.AppImage/);
  assert.doesNotMatch(manifest, /SHA256SUMS\.txt/);
});
