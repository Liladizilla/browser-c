import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const validator = await readFile(new URL("../scripts/validate-repo.mjs", import.meta.url), "utf8");

test("repository validator reads each required path directly without a check-then-open race", () => {
  assert.match(validator, /import \{ readFile \} from 'node:fs\/promises'/);
  assert.doesNotMatch(validator, /\bawait\s+access\s*\(/);
  assert.doesNotMatch(validator, /constants\.R_OK/);
  assert.match(validator, /const content = await readFile\(file, 'utf8'\)/);
  assert.match(validator, /catch \{\s*failures\.push\(file \+ ': required file is missing or unreadable'\);\s*\}/);
});

test("repository validator continues to reject empty required files", () => {
  assert.match(validator, /if \(!content\.trim\(\)\) failures\.push\(file \+ ': file is empty'\)/);
});

test("repository validator accepts the configured Debian maintainer metadata", async () => {
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const maintainerPattern = /^[^<>]+ <[^<>@\s]+@[^<>\s]+>$/;
  assert.match(pkg.build.linux.maintainer, maintainerPattern);
  assert.ok(validator.includes("[^<>@\\s]+@[^<>\\s]+"));
});
