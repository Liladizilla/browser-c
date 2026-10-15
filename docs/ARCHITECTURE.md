# Browser C Architecture

## Principles

1. Reuse a maintained production-grade web engine; do not implement HTML, CSS, JavaScript, TLS, or GPU drivers ourselves.
2. Separate trusted browser chrome from untrusted web content.
3. Keep platform-specific code behind small adapters.
4. Make security and failure behavior explicit and testable.
5. Ship only capabilities verified by CI or documented manual tests.

## Initial technology direction

- **Runtime and shell:** Electron, pinned to a supported release.
- **Language:** JavaScript ES modules for the initial prototype; TypeScript migration is a later engineering decision.
- **Engine:** Chromium as distributed with Electron.
- **UI:** trusted application window for browser chrome; visited sites in isolated `WebContentsView` or equivalent supported surfaces, never in the privileged UI renderer.
- **Testing:** Node test runner for pure logic; Node tests cover navigation and security defaults; Electron end-to-end tests remain to be added.
- **CI:** GitHub Actions on Linux, Windows, and macOS for checks and later packaged builds.

This is the proposed direction, not a guarantee that Electron exposes every feature of a full Chromium distribution.

## High-level components

```text
Browser C Desktop App
├── Browser Chrome (trusted UI)
│   ├── Tab and window controller
│   ├── Address bar and search provider
│   ├── Navigation controls
│   ├── Bookmarks, history, and session state
│   ├── Downloads and permission prompts
│   └── Settings and diagnostics
├── Browser Core (main process)
│   ├── Window and tab lifecycle
│   ├── Navigation and external-protocol policy
│   ├── Permission and download policy
│   ├── Persistence and migrations
│   └── Platform adapter
├── Isolated Web Content (Chromium renderer processes)
│   ├── Per-site content
│   └── No Node.js integration or privileged preload bridge
└── Platform Packaging
    ├── Windows
    ├── macOS
    ├── Linux
    └── CharisOS (future port/integration; feasibility gated)
```

## Security boundaries

- Keep Node integration disabled for web content; enable context isolation and sandboxing wherever supported.
- Do not expose broad IPC APIs to websites. Privileged handlers must validate sender, arguments, and allowed actions.
- Treat URLs, redirects, downloads, file paths, and external protocol requests as untrusted input.
- Apply explicit navigation rules and prevent privileged browser UI from loading arbitrary remote content.
- Ask before granting sensitive permissions; deny by default when no policy exists.
- Keep secrets out of source control, logs, crash reports, and CI artifacts.
- Track Electron/Chromium security releases and maintain an update process.
- Do not claim password storage, sync, certificate UI, extensions, or private-browsing guarantees until designed and tested.

## Networking and graphics

Chromium supplies HTTP(S), modern TLS, web standards, and rendering primitives. Browser C owns browser policy and UI around them. Verify proxy behavior, certificates, redirects, downloads, offline errors, WebGL, video decoding, and hardware acceleration across supported OS versions. GPU support depends on drivers, hardware, OS, and engine build; provide diagnostics and a software-rendering fallback.

## Data and persistence

Store bookmarks, history, preferences, and session metadata in a versioned local store. Define migration behavior and separate private-session state from persistent profiles. Do not persist private-session history or cookies accidentally. Profile locking, backup/export, and corruption recovery need explicit tests.

## Cross-platform and CharisOS

Windows, macOS, and Linux are the initial desktop targets. CharisOS is not assumed to be Linux-compatible just because it is x86_64 or can run a VM. Before choosing a port strategy, document support for process isolation, memory mapping, sockets/TLS, filesystem access, graphics surfaces, keyboard/mouse input, fonts, and system APIs. A native port or compatible host layer is a research question, not a current support claim.

## Proposed repository layout

```text
browser-c/
├── .github/workflows/ci.yml
├── docs/ARCHITECTURE.md
├── docs/ROADMAP.md
├── scripts/validate-repo.mjs
├── src/                  # Electron main process, preload, navigation and chrome UI
├── tests/                # navigation and security regression tests
├── package.json
├── SECURITY.md
├── CONTRIBUTING.md
├── LICENSE
└── README.md
```

## Definition of done

A feature is complete only when implemented, tested, reviewed for security implications, verified on relevant platforms, and documented with clear failure behavior. Passing typecheck or CI alone does not establish that a real browser works.