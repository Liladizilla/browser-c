# Browser C

**Browser C** is an early cross-platform desktop browser prototype targeting Windows, macOS, and Linux, with CharisOS as a future research target. It uses Electron's bundled Chromium engine rather than attempting to implement a new web engine.

## Downloads

Pre-release installers and release notes are published on the [GitHub Releases page](https://github.com/Liladizilla/browser-c/releases). Choose the package for your operating system and architecture. Browser C is still an early prototype; read the release notes and known limitations before using it.

- **Linux:** AppImage or Debian/Ubuntu `.deb`.
- **Windows:** x64 NSIS installer (`.exe`).
- **macOS:** DMG installer or ZIP app bundle. Signing/notarization and manual device validation are not yet complete.

See the [Installation and upgrade guide](docs/INSTALLATION.md) for setup, checksum verification, troubleshooting, and upgrade notes. The official project site is [browser-c.vercel.app](https://browser-c.vercel.app).

## Current capabilities

- Multi-tab browsing with keyboard shortcuts and session restore.
- HTTP/HTTPS address navigation, bookmarks, browsing history, and page find/zoom controls.
- Selectable, profile-persisted search providers: Google, DuckDuckGo, Bing, and Brave Search.
- Download prompts, progress/cancellation, bounded completed-download history, reveal-in-folder actions, and warnings before saving known executable/script/installer file types. Browser C does not scan files for malware.
- Session-scoped prompts for a supported set of website permissions, with unsupported and insecure requests denied by default; temporary grants can be revoked for the active site from the toolbar.
- Private tabs use isolated, non-persistent Electron sessions. Files explicitly saved to disk remain on disk by design.
- Automated JavaScript checks, cross-platform CI, a Linux Electron integration smoke test, and CodeQL scanning.
- Cross-platform packaging workflows for Linux, Windows, and macOS, dependency auditing, package-format validation, SHA-256 checksums, an SPDX SBOM, and build-provenance attestations.

This remains a prototype, not a finished or security-certified daily-use browser. CI exercises a subset of UI, navigation, privacy, and recovery behaviors; it cannot prove that all websites, downloads, permissions, GPU drivers, codecs, certificate failures, or platform configurations work correctly. Signing/notarization, broader privacy-leakage testing, upgrades, uninstall, and profile-retention behavior are not fully validated. Do not treat green CI as proof that the browser is perfect or suitable for sensitive daily use.

## Security baseline

- Electron Chromium supplies the browser engine.
- Context isolation, sandboxing, disabled Node integration for browser chrome and visited pages, and a narrow preload IPC API.
- Website popups can open in restricted child windows with Node integration disabled, context isolation and sandboxing enabled; nested popups and non-HTTP(S) navigation are denied.
- Navigation is restricted to HTTP and HTTPS.
- Website permissions are denied unless an explicitly supported permission is allowed for the current app session.

## Policies and project documentation

- [Privacy notice](PRIVACY.md)
- [Terms of use](TERMS.md)
- [Security policy](SECURITY.md)
- [Security model](docs/SECURITY_MODEL.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)
- [Installation and upgrade](docs/INSTALLATION.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)
- [Release engineering](docs/RELEASES.md)
- [Changelog](CHANGELOG.md)
- [Contributing](CONTRIBUTING.md)

## Development

Use Node.js 24 for CI parity. Install dependencies and run:

```sh
npm ci
npm test
npm run validate
npm run check
npm start
```

The committed `package-lock.json` pins the dependency graph for repeatable installs. Do not treat unit tests or startup smoke tests as proof that all websites, GPU drivers, codecs, private-session behavior, or platform configurations work.

## Platform goals

| Platform | Goal | Status |
| --- | --- | --- |
| Windows 10/11 x64 | Desktop app | CI installs and launches the packaged NSIS build; manual device testing pending |
| macOS supported Electron architectures | Desktop app | CI launches ZIP app bundle and DMG-installed copy; signing and manual device testing pending |
| Linux x64 | Desktop app | CI installs Debian package and launches AppImage payload; manual Fedora/device testing pending |
| CharisOS | Native integration or compatible browser host | Research required |

## License

Browser C project code is licensed under the [MIT License](LICENSE). Electron, Chromium, and other third-party components retain their own licenses and notices.
