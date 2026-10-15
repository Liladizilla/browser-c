# Browser C

**Browser C** is an independent cross-platform desktop browser targeting Windows, macOS, and Linux, with CharisOS as a future research target.

## Current stage

The first Electron shell now exists on the `feat/electron-browser-shell` branch. It uses Electron's bundled Chromium engine and includes a navigation toolbar, address/search input, back/forward/reload/stop/home controls, and an isolated website view.

This is an early prototype, not yet a complete daily-use browser. Tabs, bookmarks, history, download management, user-controlled permissions, private sessions, installer packaging, and browser-level security testing remain future work.

## Technology and security

- Electron + JavaScript modules, with the Electron version pinned in the application manifest.
- Chromium supplied by Electron; no attempt to implement a new web engine.
- Context isolation, sandboxing, disabled Node integration for both chrome and visited pages, and a narrow preload API.
- Website-created windows blocked by default; web permissions denied until user-facing permission controls exist.
- Address navigation restricted to HTTP/HTTPS. Plain text becomes a web search query.
- Graphics and media depend on Chromium/Electron support and must be verified on target hardware.

Read [Architecture](docs/ARCHITECTURE.md), [Roadmap](docs/ROADMAP.md), and the [Security model](docs/SECURITY_MODEL.md).

## Development

Install a supported Node.js release and project dependencies, then run the app with the documented start command. Foundation tests run with:

```sh
npm test
npm run validate
npm run check
```

Linux, Windows, and macOS are CI targets. A passing foundation test does not establish that every website, GPU, codec, or hardware configuration works.

## Platform goals

| Platform | Goal | Status |
| --- | --- | --- |
| Windows 10/11 x64 | Desktop app | Prototype work |
| macOS supported Electron architectures | Desktop app | Prototype work |
| Linux x64 | Desktop app | Prototype work |
| CharisOS | Native integration or compatible browser host | Research required |

## License

Browser C project code is licensed under the [MIT License](LICENSE). Electron, Chromium, and other third-party components retain their own licenses and notices.
