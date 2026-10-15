import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';

const requiredFiles = [
  'README.md',
  'LICENSE',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'docs/ARCHITECTURE.md',
  'docs/ROADMAP.md',
  '.github/workflows/ci.yml',
  'package.json',
];

const failures = [];
for (const file of requiredFiles) {
  try {
    await access(file, constants.R_OK);
    const content = await readFile(file, 'utf8');
    if (!content.trim()) failures.push(`${file}: file is empty`);
  } catch {
    failures.push(`${file}: required file is missing or unreadable`);
  }
}

try {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  if (pkg.name !== 'browser-c') failures.push('package.json: unexpected package name');
  if (pkg.license !== 'MIT') failures.push('package.json: license must be MIT');
  if (!pkg.scripts?.test || !pkg.scripts?.validate) {
    failures.push('package.json: test and validate scripts are required');
  }
} catch (error) {
  failures.push(`package.json: invalid JSON (${error.message})`);
}

if (failures.length) {
  console.error('Repository validation failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Repository validation passed (${requiredFiles.length} required files checked).`);
}