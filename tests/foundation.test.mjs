import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('package metadata identifies Browser C and MIT licensing', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.name, 'browser-c');
  assert.equal(pkg.license, 'MIT');
  assert.ok(pkg.scripts.validate);
});

test('project documentation describes the platform and engine plan', async () => {
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
  const architecture = await readFile(new URL('../docs/ARCHITECTURE.md', import.meta.url), 'utf8');
  const roadmap = await readFile(new URL('../docs/ROADMAP.md', import.meta.url), 'utf8');
  assert.match(readme, /Windows/);
  assert.match(readme, /macOS/);
  assert.match(readme, /Linux/);
  assert.match(readme, /CharisOS/);
  assert.match(architecture, /sandbox/i);
  assert.match(architecture, /Chromium/);
  assert.match(roadmap, /CharisOS/);
});

test('CI covers the three initial desktop operating systems', async () => {
  const workflow = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.match(workflow, /ubuntu-latest/);
  assert.match(workflow, /windows-latest/);
  assert.match(workflow, /macos-latest/);
});
