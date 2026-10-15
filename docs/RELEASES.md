# Building and distributing Browser C

## Automated packages

The `Desktop packages` workflow runs when a `v*` tag is pushed or when manually dispatched from GitHub Actions. It creates platform-specific build artifacts:

- Linux: AppImage and Debian package
- Windows: NSIS installer
- macOS: DMG and ZIP

Each platform job uses the committed npm lockfile with `npm ci`, runs repository validation, syntax checks, and automated tests, then builds packages with Electron Builder. The workflow generates a `SHA256SUMS.txt` manifest and validates that the expected platform package formats exist and that every artifact is listed exactly once with a matching SHA-256 digest before uploading the packages plus manifest as a workflow artifact. Workflow artifacts are retained for 14 days and are not the same as a published GitHub Release.

## Verify downloaded artifacts

Keep the package and its `SHA256SUMS.txt` file together. From a Linux/macOS terminal, run:

```sh
sha256sum --check SHA256SUMS.txt
```

On Windows PowerShell, verify a named file by comparing its digest with the corresponding line in `SHA256SUMS.txt`:

```powershell
Get-FileHash .\Browser-C-0.2.0-win32-x64.exe -Algorithm SHA256
```

Use the actual filename produced by the workflow. A checksum detects accidental corruption or mismatches; it does not prove who built a package or protect against an attacker who can replace both the package and its manifest.

## Release gates and limitations

- Workflow artifacts are build outputs for testing, not stable public releases.
- The Linux Electron startup smoke test checks that the application stays alive during startup under Xvfb. It is not a full navigation, download, or private-session end-to-end test.
- macOS signing/notarization, Windows code signing, signed provenance/attestations, SBOM publication, clean-install/upgrade testing, and installed-app launch/navigation smoke tests on Windows and macOS remain future release gates. Artifact validation confirms package presence and file integrity, not successful installation or runtime behavior.
- Do not advertise an artifact as a stable release until platform launch and security checks are complete.

## Local checks

```sh
npm ci
npm run validate
npm run check
npm test
npm run smoke
```
