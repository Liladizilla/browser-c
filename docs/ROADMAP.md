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
- [x] Run automated packaged-app smoke tests on Linux and Windows, plus packaged macOS app-bundle smoke tests in CI; manual target-device validation remains open.
- [ ] Test a local page and controlled HTTPS page on each target OS.
- [x] Use lockfile-based reproducible dependency installation with `npm ci`.

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
- [x] Add Linux Electron smoke coverage for private-session cookie/storage isolation, history/session exclusions, permission-grant isolation, private-download persistence exclusion, and cleanup of private cookies on close.
- [ ] Add crash/restart and actual packaged-build tests proving private state cannot leak into restored sessions or persisted profiles across app restarts.
- [ ] Review private-mode edge cases on Windows and macOS using actual packaged builds.

**Exit gate:** features have tests and defined behavior for crashes, denied permissions, network failure, and invalid input.

## Phase 4 — Reliability, networking, graphics, privacy

- [x] Test redirects and offline connection-refused navigation/recovery in the Linux Electron smoke suite.
- [x] Fail closed on invalid TLS certificates and show human-readable certificate/network failure guidance.
- [ ] Add a dedicated certificate error interstitial plus proxy and captive-portal coverage.
- [ ] Verify WebGL, supported WebGPU, media playback, fonts, scaling, and acceleration per OS.
- [ ] Add GPU diagnostics and fallback behavior for incompatible drivers.
- [ ] Profile memory, CPU, startup, long sessions, and many-tab workloads on modest hardware.
- [ ] Add profile migrations, corruption recovery, and data export/import strategy.
- [x] Surface renderer-process crashes as visible tab errors and verify reload recovery in Linux Electron smoke.
- [ ] Define telemetry policy; default to no telemetry unless explicitly designed and disclosed.

**Exit gate:** compatibility matrix records tested hardware, OS versions, limitations, and reproducible results.

## Phase 5 — Release engineering and hardening

- [ ] Build signed/notarized packages where credentials and platform requirements permit.
- [x] Stage only distributable package files, run dependency audits, validate non-empty package formats and SHA-256 checksums, and attest package provenance; release notes and a complete dependency inventory remain open.
- [x] Add automated CodeQL code scanning for JavaScript.
- [x] Add lockfile-based reproducible dependency installation and dependency vulnerability scanning.
- [x] Add automated secret scanning of pull requests, pushes, and repository history.
- [ ] Test clean install, upgrade, uninstall, profile retention, and rollback.
- [x] Add a manual/tag-triggered cross-platform packaging workflow that uploads only staged, validated package files after tests and dependency audits pass.
- [x] Add Windows/macOS package-smoke CI to build distributables, validate checksums/SBOMs, inspect artifacts, install and launch the Windows NSIS package, launch the macOS app bundle extracted from ZIP, and retain artifacts; macOS DMG installation and lifecycle testing remain open.
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
