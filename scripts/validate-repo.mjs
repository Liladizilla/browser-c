import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';

const requiredFiles = [
  'README.md', 'LICENSE', 'CONTRIBUTING.md', 'SECURITY.md',
  'docs/ARCHITECTURE.md', 'docs/ROADMAP.md', 'docs/SECURITY_MODEL.md', 'docs/RELEASES.md',
  '.github/workflows/ci.yml', '.github/workflows/codeql.yml', '.github/workflows/packages.yml', 'package.json', 'src/main.js', 'src/preload.cjs',
  'src/navigation.js', 'src/renderer/index.html', 'src/renderer/styles.css',
  'src/renderer/renderer.js', 'tests/navigation.test.mjs', 'tests/security-model.test.mjs', 'tests/tabs-model.test.mjs'
];
const failures = [];
for (const file of requiredFiles) {
  try {
    await access(file, constants.R_OK);
    const content = await readFile(file, 'utf8');
    if (!content.trim()) failures.push(file + ': file is empty');
  } catch {
    failures.push(file + ': required file is missing or unreadable');
  }
}
try {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  if (pkg.name !== 'browser-c') failures.push('package.json: unexpected package name');
  if (pkg.license !== 'MIT') failures.push('package.json: license must be MIT');
  if (pkg.main !== 'src/main.js') failures.push('package.json: main must point to src/main.js');
  if (!pkg.scripts?.start || !pkg.scripts?.test || !pkg.scripts?.validate || !pkg.scripts?.check) {
    failures.push('package.json: start, test, validate, and check scripts are required');
  }
  if (pkg.devDependencies?.electron !== '44.7.2') failures.push('package.json: Electron must remain pinned to the reviewed stable version');
} catch (error) {
  failures.push('package.json: invalid JSON (' + error.message + ')');
}
if (failures.length) {
  console.error('Repository validation failed:');
  for (const failure of failures) console.error('- ' + failure);
  process.exitCode = 1;
} else {
  console.log('Repository validation passed (' + requiredFiles.length + ' required files checked).');
}
