# Browser C

**Browser C** is an independent cross-platform desktop browser project targeting Windows, macOS, Linux, and, subject to OS support work, CharisOS.

The goal is a real daily-use browser with a production-grade web engine, reliable networking, modern graphics, useful browser features, and security as a core requirement. This repository is the beginning of that work, not a claim that those features already exist.

## Status

**Stage: foundation and architecture.** The repository and initial engineering plan are in place. A working browser shell, automated platform builds, and browser-level verification remain to be implemented.

## Technology direction

- **Desktop shell:** Electron + TypeScript as the initial cross-platform application shell.
- **Web engine:** Chromium bundled with a pinned, supported Electron release. We will not write a browser engine from scratch.
- **Browser features:** tabs, address/search, navigation, bookmarks, history, downloads, settings, private sessions, and explicit permission controls.
- **Security:** context isolation, sandboxed web content, restrictive navigation and permissions, no Node.js access from visited websites, dependency updates, and safe download handling.
- **Graphics and media:** use engine-supported rendering, WebGL/WebGPU where available, media playback, and hardware acceleration; verify on real target hardware.
- **Platform strategy:** Windows, macOS, and Linux first. CharisOS is a separate integration target dependent on its OS interfaces.

Electron does not automatically expose every feature of a full Chromium distribution. Browser-specific features must be evaluated and tested before being promised.

## Project documents

- [Architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)

## Foundation checks

The initial CI validates repository structure on Linux, Windows, and macOS. It is not a browser integration test and does not produce installable application binaries yet.

```sh
npm test
npm run validate
```

Application build instructions will be added with the initial Electron application scaffold.

## Platform goals

| Platform | Goal | Status |
| --- | --- | --- |
| Windows 10/11 x64 | Desktop app | Planned |
| macOS supported Electron architectures | Desktop app | Planned |
| Linux x64 | Desktop app | Planned |
| CharisOS | Native integration or compatible browser host | Research required |

Exact minimum OS versions and CPU architectures will be documented after testing.

## License

Browser C project code is licensed under the [MIT License](LICENSE). Third-party components, including Chromium and Electron, retain their own licenses and notices.