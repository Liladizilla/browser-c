# Changelog

Notable user-facing changes are recorded here. This project is an early prerelease; entries describe changes made, not a guarantee that every feature works on every platform.

## [0.2.1] - 2026-10-16

### Fixed
- Website popup windows are no longer unconditionally blocked; supported sign-in flows can open restricted child windows.
- Popup windows retain Electron sandboxing, context isolation, disabled Node integration, and HTTP(S)-only navigation. Nested popups are denied.
- Settings, password vault, and library panels no longer sit behind the native webpage surface.
- Settings and library panels are constrained to the viewport and scroll internally when their contents are too tall.

### Documentation
- Added platform-specific installation, checksum verification, first-run smoke testing, upgrade cautions, and troubleshooting guidance.
- Updated release, architecture, security, and roadmap documentation to reflect the popup policy and known native-layer overlay limitation.

### Known limitations
- The webpage surface is temporarily hidden while Settings, Passwords, or Library panels are open. A proper native overlay/composition design remains future work.
- Google and other provider sign-in flows still require manual site-specific validation.
- This remains a prerelease, not a security-certified daily-use browser. Platform signing/notarization and clean-install/upgrade/uninstall testing are incomplete.

## [0.2.0] - 2026-10-16

- First cross-platform packaged prerelease with Linux AppImage and Debian package, Windows NSIS installer, and macOS DMG/ZIP.
- Added release SBOM, SHA-256 manifest, build provenance attestations, and platform package smoke tests.
- Added multi-tab browsing, bookmarks, history, downloads, permissions prompts, private tabs, and configurable search providers as documented in the README.
