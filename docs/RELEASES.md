# Building and distributing Browser C

## Automated packages

The `Desktop packages` workflow runs when a `v*` tag is pushed or when manually dispatched from GitHub Actions. It creates platform-specific build artifacts:

- Linux: AppImage and Debian package
- Windows: NSIS installer
- macOS: DMG and ZIP

Each platform job installs the pinned Electron application dependency, runs repository validation, syntax checks, and automated tests, then builds and uploads its artifacts. Workflow artifacts are retained for 14 days and are not the same as a published GitHub Release.

## Current limitations

- The repository does not yet contain a generated `package-lock.json`; installs currently use `npm install --no-package-lock`. This is not a fully reproducible dependency graph. Do not switch CI to `npm ci` until a real lockfile has been generated and validated.
- Packaging is an initial CI path, not proof that installers launch or run correctly on every platform.
- macOS signing/notarization, Windows code signing, checksums, SBOM/provenance, clean-install/upgrade testing, and actual OS smoke tests remain future release gates.
- Do not advertise artifacts as stable releases until platform smoke tests and security checks are complete.

## Local checks

```sh
npm run validate
npm run check
npm test
```
