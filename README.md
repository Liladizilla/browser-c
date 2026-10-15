# Browser C

**Browser C** is an early cross-platform desktop browser prototype targeting Windows, macOS, and Linux, with CharisOS as a future research target. It uses Electron's bundled Chromium engine rather than attempting to implement a new web engine.

## Current capabilities

- Multi-tab browsing with keyboard shortcuts and session restore.
- HTTP/HTTPS address navigation, bookmarks, browsing history, and page find/zoom controls.
- Selectable, profile-persisted search providers: Google, DuckDuckGo, Bing, and Brave Search.
- Download prompts, progress/cancellation, bounded completed-download history, reveal-in-folder actions, and warnings before saving known executable/script/installer file types (Browser C does not scan files for malware).
- Session-scoped prompts for a supported set of website permissions, with unsupported and insecure requests denied by default; temporary grants can be revoked for the active site from the toolbar.
- Private tabs use isolated, non-persistent Electron sessions; downloads saved to disk remain on disk by design.
- Automated JavaScript checks, cross-platform CI, a Linux Electron integration smoke test, and CodeQL scanning.
- An initial cross-platform packaging workflow for Linux, Windows, and macOS, with dependency auditing, staging that excludes unpacked build intermediates, non-empty package-format checks, SHA-256 checksum validation, and build-provenance attestations before distributable artifacts are uploaded.

This remains a prototype, not a finished or security-certified daily-use browser. The Linux Electron smoke test now exercises local back/forward navigation, reload/stop, redirect handling, failed-navigation recovery, and checks that private tabs use a separate non-persistent session and are excluded from session/history persistence. These checks do not prove that all websites, downloads, permissions, GPU drivers, codecs, or platform configurations work correctly. Installer builds still need actual launch and navigation smoke tests on Windows and macOS. Code signing/notarization, broader privacy-leakage testing, and installed-app launch/navigation tests on Windows and macOS remain outstanding. The packaging workflow now checks that each platform produced its expected package formats and that every artifact matches its SHA-256 manifest. Do not treat current CI as a claim that the browser is perfect or ready for sensitive daily use.

## Security baseline

- Electron Chromium supplies the browser engine.
- Context isolation, sandboxing, disabled Node integration for browser chrome and visited pages, and a narrow preload IPC API.
- Website-created windows are blocked by default.
- Navigation is restricted to HTTP and HTTPS.
- Website permissions are denied unless an explicitly supported permission is allowed for the current app session.

Read [Architecture](docs/ARCHITECTURE.md), [Roadmap](docs/ROADMAP.md), [Security model](docs/SECURITY_MODEL.md), and [Release engineering](docs/RELEASES.md).

## Development

Use Node.js 24 for CI parity. Install dependencies and run:

```sh
npm ci
npm test
npm run validate
npm run check
npm start
```

The committed `package-lock.json` pins the dependency graph for repeatable installs. Do not treat green unit tests or the Linux startup smoke test as proof that all websites, GPU drivers, codecs, private-session behavior, or platform configurations work.

## Platform goals

| Platform | Goal | Status |
| --- | --- | --- |
| Windows 10/11 x64 | Desktop app | Packaging workflow added; runtime smoke tests pending |
| macOS supported Electron architectures | Desktop app | Packaging workflow added; runtime smoke tests pending |
| Linux x64 | Desktop app | Packaging workflow added; runtime smoke tests pending |
| CharisOS | Native integration or compatible browser host | Research required |

## License

Browser C project code is licensed under the [MIT License](LICENSE). Electron, Chromium, and other third-party components retain their own licenses and notices.
