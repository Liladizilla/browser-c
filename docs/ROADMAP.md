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
- [ ] Bookmarks, history, search-provider settings, and clear-history controls.
- [ ] Downloads UI, destination handling, cancellation, and safe-file handling.
- [ ] Permission prompts for camera, microphone, geolocation, notifications, and other exposed APIs.
- [ ] Find in page, zoom, print, devtools access, and accessibility review.
- [ ] Private windows with isolated non-persistent sessions and leakage tests.

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
- [ ] Add dependency/vulnerability scanning and secret scanning.
- [ ] Test clean install, upgrade, uninstall, profile retention, and rollback.
- [ ] Publish only artifacts from successful release workflows.

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
