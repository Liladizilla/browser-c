# Browser C

**Browser C** is an early cross-platform desktop browser prototype targeting Windows, macOS, and Linux, with CharisOS as a future research target. It uses Electron's bundled Chromium engine rather than attempting to implement a new web engine.

## Current capabilities

- Multi-tab browsing with keyboard shortcuts and session restore.
- HTTP/HTTPS address navigation, bookmarks, browsing history, and page find/zoom controls.
- Download prompts, progress/cancellation, bounded completed-download history, and reveal-in-folder actions.
- Session-scoped prompts for a supported set of website permissions, with unsupported and insecure requests denied by default.
- Private tabs use isolated, non-persistent Electron sessions; downloads saved to disk remain on disk by design.
- Automated JavaScript checks, cross-platform CI, a Linux startup smoke test, and CodeQL scanning.
- An initial cross-platform packaging workflow for Linux, Windows, and macOS, with SHA-256 checksum manifests.

This remains a prototype, not a finished or security-certified daily-use browser. The smoke test checks startup only, not full navigation or private-session leakage. Installer builds still need actual launch/navigation smoke tests on each OS. Signing/notarization and complete release validation remain outstanding.

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
