import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ci = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
const secrets = await readFile(new URL("../.github/workflows/secrets.yml", import.meta.url), "utf8");
const packages = await readFile(new URL("../.github/workflows/packages.yml", import.meta.url), "utf8");
const packageSmoke = await readFile(new URL("../.github/workflows/package-smoke.yml", import.meta.url), "utf8");
const crossPlatformPackageSmoke = await readFile(new URL("../.github/workflows/package-smoke-cross-platform.yml", import.meta.url), "utf8");
const smoke = await readFile(new URL("../scripts/smoke-electron.mjs", import.meta.url), "utf8");
const sbomScript = await readFile(new URL("../scripts/generate-sbom.mjs", import.meta.url), "utf8");
const mainSource = await readFile(new URL("../src/main.js", import.meta.url), "utf8");
const collector = await readFile(new URL("../scripts/collect-release-artifacts.mjs", import.meta.url), "utf8");
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const lock = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url), "utf8"));

test("CI audits the pinned dependency tree", () => {
  assert.ok(ci.includes("npm audit --audit-level=high"));
  assert.ok(ci.includes("npm ci --no-audit --no-fund"));
  assert.equal(lock.lockfileVersion, 3);
  assert.equal(lock.packages[""].devDependencies.electron, pkg.devDependencies.electron);
});

test("secret scanning runs on pushes, pull requests, and schedule", () => {
  assert.ok(secrets.includes("pull_request:"));
  assert.ok(secrets.includes("schedule:"));
  assert.ok(secrets.includes("fetch-depth: 0"));
  assert.ok(secrets.includes("gitleaks/gitleaks-action@v3"));
});

test("secret scanning has read-only repository permissions", () => {
  assert.ok(secrets.includes("contents: read"));
  assert.ok(secrets.includes("pull-requests: read"));
  assert.ok(!secrets.includes("contents: write"));
  assert.ok(!secrets.includes("pull-requests: write"));
});

test("desktop packages generate an SBOM and validate all release files before attestation", () => {
  assert.ok(packages.includes("npm audit --audit-level=high"));
  assert.ok(packages.includes("node scripts/collect-release-artifacts.mjs ${{ matrix.platform }}"));
  assert.ok(packages.includes("node scripts/generate-sbom.mjs release/artifacts/SBOM.spdx.json"));
  assert.ok(packages.includes("npm run checksums -- release/artifacts"));
  assert.ok(packages.includes("node scripts/validate-release.mjs ${{ matrix.platform }} release/artifacts"));
  assert.ok(packages.includes("path: release/artifacts/*"));
  assert.ok(packages.includes("uses: actions/attest-build-provenance@v4"));
  assert.ok(packages.includes("subject-path:"));
  assert.ok(packages.includes("id-token: write"));
  assert.ok(packages.includes("attestations: write"));
  assert.ok(packages.indexOf("Generate SPDX software bill of materials") < packages.indexOf("Generate SHA-256 checksums"));
  assert.ok(packages.indexOf("Generate SHA-256 checksums") < packages.indexOf("Validate package formats, SBOM, and checksums"));
  assert.ok(packages.indexOf("Validate package formats, SBOM, and checksums") < packages.indexOf("Attest package, SBOM, and checksum provenance"));
  assert.ok(packages.indexOf("Attest package, SBOM, and checksum provenance") < packages.indexOf("Upload package artifacts and dependency inventory"));
});

test("Electron smoke waits for the UI smoke suite instead of sampling too early", () => {
  assert.ok(smoke.includes("BROWSER_C_UI_SMOKE_(?:PASS|FAIL)"));
  assert.ok(smoke.includes("startupWindowMs = 45_000"));
  assert.ok(smoke.includes("clearTimeout(timeoutHandle)"));
  assert.ok(!smoke.includes("setInterval("));
  assert.ok(smoke.includes("BROWSER_C_OFFLINE_RECOVERY_PASS"));
  assert.ok(smoke.includes("BROWSER_C_RENDERER_CRASH_RECOVERY_PASS"));
});

test("release staging excludes unpacked build output and rejects empty packages", () => {
  assert.ok(collector.includes("expectedExtensions"));
  assert.ok(collector.includes("details.size > 0"));
  assert.ok(collector.includes("rm(artifactDirectory, { recursive: true, force: true })"));
  assert.ok(collector.includes("copyFile("));
});

test("Linux package smoke builds, inventories, and inspects real distributable payloads", () => {
  assert.ok(packageSmoke.includes("pull_request:"));
  assert.ok(packageSmoke.includes("npx --yes electron-builder@26.0.12 --linux AppImage deb"));
  assert.ok(packageSmoke.includes("node scripts/collect-release-artifacts.mjs linux"));
  assert.ok(packageSmoke.includes("node scripts/generate-sbom.mjs release/artifacts/SBOM.spdx.json"));
  assert.ok(packageSmoke.includes("npm run checksums -- release/artifacts"));
  assert.ok(packageSmoke.includes("node scripts/validate-release.mjs linux release/artifacts"));
  assert.ok(packageSmoke.includes("dpkg-deb --info release/artifacts/*.deb"));
  assert.ok(packageSmoke.includes("--appimage-extract"));
  assert.ok(packageSmoke.includes("test -f squashfs-root/resources/app.asar"));
  assert.ok(packageSmoke.includes("if-no-files-found: error"));
});

test("Linux Debian package maintainer metadata is configured", () => {
  assert.match(pkg.build.linux.maintainer, /^[^<>]+ <[^<>@\s]+@[^<>\s]+>$/);
});

test("Linux package workflow installs and launches the packaged application", () => {
  assert.ok(packageSmoke.includes("sudo apt-get install -y ./release/artifacts/*.deb"));
  assert.ok(packageSmoke.includes("command -v browser-c"));
  assert.ok(packageSmoke.includes("xvfb-run -a node scripts/smoke-installed-linux.mjs"));
  assert.ok(packageSmoke.includes("retention-days: 7"));
});

test("Linux package workflow launches the extracted AppImage payload", () => {
  assert.ok(packageSmoke.includes("APPDIR: ${{ github.workspace }}/release/squashfs-root"));
  assert.ok(packageSmoke.includes("BROWSER_C_EXECUTABLE: ${{ github.workspace }}/release/squashfs-root/AppRun"));
  assert.ok(packageSmoke.includes("xvfb-run -a node scripts/smoke-installed-linux.mjs"));
  assert.ok(packageSmoke.includes("test -x squashfs-root/AppRun"));
});

test("CI runs the Electron integration smoke suite on Windows and macOS", () => {
  assert.ok(ci.includes("electron-cross-platform-smoke:"));
  assert.ok(ci.includes("os: [windows-latest, macos-latest]"));
  assert.ok(ci.includes("run: npm run smoke"));
  assert.ok(ci.includes("timeout-minutes: 10"));
});

test("Windows and macOS package smoke builds and inspects distributable artifacts", () => {
  assert.ok(crossPlatformPackageSmoke.includes("platform: windows"));
  assert.ok(crossPlatformPackageSmoke.includes("platform: macos"));
  assert.ok(crossPlatformPackageSmoke.includes("npx --yes electron-builder@26.0.12"));
  assert.ok(crossPlatformPackageSmoke.includes("node scripts/collect-release-artifacts.mjs ${{ matrix.platform }}"));
  assert.ok(crossPlatformPackageSmoke.includes("node scripts/generate-sbom.mjs release/artifacts/SBOM.spdx.json"));
  assert.ok(crossPlatformPackageSmoke.includes("node scripts/validate-release.mjs ${{ matrix.platform }} release/artifacts"));
  assert.ok(crossPlatformPackageSmoke.includes("Windows NSIS installer is missing or empty"));
  assert.ok(crossPlatformPackageSmoke.includes("Contents/Resources/app.asar"));
  assert.ok(crossPlatformPackageSmoke.includes("if-no-files-found: error"));
});

test("SBOM generation resolves the npm command on Windows runners", () => {
  assert.ok(sbomScript.includes('process.platform === "win32" ? "npm.cmd" : "npm"'));
  assert.ok(sbomScript.includes("spawnSync(npmCommand"));
  assert.ok(sbomScript.includes('shell: process.platform === "win32"'));
});

test("cross-platform smoke deterministically checks navigation error isolation", () => {
  assert.ok(mainSource.includes('fixtureTab.view.webContents.emit("did-fail-load", {}, -324, "ERR_EMPTY_RESPONSE"'));
  assert.ok(mainSource.includes('backgroundTab.view.webContents.emit("did-fail-load", {}, -324, "ERR_EMPTY_RESPONSE"'));
  assert.ok(mainSource.includes('Math.ceil(timeoutMs / 50)'));
});
