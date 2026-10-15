import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export async function writeChecksums(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name !== "SHA256SUMS.txt")
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, "en"));

  if (files.length === 0) {
    throw new Error(`No package artifacts found in ${directory}`);
  }

  const lines = [];
  for (const name of files) {
    const contents = await readFile(path.join(directory, name));
    const digest = createHash("sha256").update(contents).digest("hex");
    lines.push(`${digest}  ${name}`);
  }

  const manifest = lines.join("\n") + "\n";
  await writeFile(path.join(directory, "SHA256SUMS.txt"), manifest, { mode: 0o644 });
  return manifest;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const directory = path.resolve(process.argv[2] ?? "release");
  try {
    await writeChecksums(directory);
    console.log(`Wrote SHA256SUMS.txt for package artifacts in ${directory}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
