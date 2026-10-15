# Browser C Roadmap

Milestones describe work to do, not features that already exist. Checkboxes reflect repository work, not unverified runtime claims.

## Phase 1 — Repository and engineering foundation

- [x] Create public repository and MIT license.
- [x] Document architecture, security boundaries, platform plan, and roadmap.
- [x] Add CI and repository validation.
- [x] Add contribution and vulnerability-reporting guidance.
- [x] Pin the initial Electron runtime version and document packaging direction.

## Phase 2 — Minimal desktop shell

- [x] Add pinned Electron application scaffold.
- [x] Build browser window with address/search, back, forward, reload, stop, and home controls.
- [x] Render websites in isolated, sandboxed Chromium content surfaces.
- [x] Add HTTP/HTTPS navigation policy and narrow IPC boundaries.
- [x] Add automated address-resolution and security-policy regression tests.
- [ ] Run application smoke tests on Linux, Windows, and macOS.
- [ ] Test a local page and controlled HTTPS page on each target OS.
- [ ] Add lockfile-based reproducible dependency installation.

**Exit gate:** app launches and navigates on Linux, Windows, and macOS; untrusted content cannot access Node.js or privileged browser APIs. CI and unit tests alone do not satisfy this gate.

## Phase 3 — Daily-use browser features

- [x] Multiple tabs with create, switch, and close behavior.
- [x] Keyboard shortcuts for new tab, close tab, focus address, reload, and cycle tabs.
- [x] Versioned session restore for up to ten web tabs.
- [x] Preserve the selected tab and save sessions when windows close.
- [x] Bookmarks, browsing history, persistent profile storage, and clear-history controls.
- [x] Search-provider settings for Google, DuckDuckGo, Bing, and Brave Search, persisted in the browser profile.
- [x] Download list, explicit save-location prompt, progress display, and cancellation.
- [x] Completed-download history persists (bounded) and can reveal a completed file in its folder.
- [x] Warn before saving known executable, script, and installer file types; Cancel is the default. This is not malware scanning.
- [ ] Malware scanning or OS-integrated reputation checks for downloads.
- [x] Explicit session-scoped permission prompts for supported camera/microphone, geolocation, notifications, MIDI, clipboard-read, and pointer-lock requests; unsupported/insecure requests remain denied, with active-site grants revocable from the toolbar.
- [x] Find in page with next/previous navigation and Ctrl/Cmd+F entry.
- [x] Per-tab page zoom controls with keyboard shortcuts and bounded 50%–300% scaling.
- [ ] Print, devtools access, and accessibility review.
- [x] Private tabs use unique non-persistent sessions; private URLs are excluded from saved sessions/history and completed-download persistence.
- [ ] Add runtime leakage tests and review private-mode edge cases on supported operating systems.

**Exit gate:** features have tests and defined behavior for crashes, denied permissions, network failure, and invalid input.

## Phase 4 — Reliability, networking, graphics, privacy

- [ ] Test redirects, TLS/certificate errors, proxies, captive portals, and offline behavior.
- [ ] Verify WebGL, supported WebGPU, media playback, fonts, scaling, and acceleration per OS.
- [ ] Add GPU diagnostics and fallback behavior for incompatible drivers.
- [ ] Profile memory, CPU, startup, long sessions, and many-tab workloads on modest hardware.
- [ ] Add profile migrations, corruption recovery, and data export/import strategy.
- [ ] Define telemetry policy; default to no telemetry unless explicitly designed and disclosed.

**Exit gate:** compatibility matrix records tested hardware, OS versions, limitations, and reproducible results.

## Phase 5 — Release engineering and hardening

- [ ] Build signed/notarized packages where credentials and platform requirements permit.
- [ ] Generate checksums, release notes, dependency inventory, and provenance where feasible.
- [x] Add automated CodeQL code scanning for JavaScript.
- [ ] Add lockfile-based reproducible dependency installation and dependency vulnerability scanning.
- [ ] Add secret scanning.
- [ ] Test clean install, upgrade, uninstall, profile retention, and rollback.
- [x] Add a manual/tag-triggered cross-platform packaging workflow that uploads artifacts only after validation and tests pass.
- [ ] Publish signed/notarized release artifacts; packaging workflow runs still need platform validation.

## Phase 6 — CharisOS feasibility and integration

- [ ] Document CharisOS process, memory, filesystem, networking, graphics, input, and windowing APIs.
- [ ] Determine whether Electron/Chromium can be ported or a compatible host layer is feasible.
- [ ] Build a technical spike and measure memory/graphics requirements.
- [ ] Define a separate support gate before claiming compatibility.

**Exit gate:** a real browser process renders and navigates real pages on CharisOS with documented security boundaries. A VM screenshot or static mockup is not sufficient.

## Release policy

- Keep the default branch buildable.
- CI failures block release artifacts.
- Never mark planned features as implemented.
- Prioritize browser security updates over cosmetic features.
- Record platform-specific gaps rather than silently weakening security.
