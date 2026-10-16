# Browser C Privacy Notice

**Last updated:** 16 October 2026

Browser C is an early desktop browser prototype. This notice describes the intended behavior of the desktop application and the project website. The implementation may change; consult the source code and release notes for the version you install.

## Desktop application

### Data stored on your device

Browser C stores browser profile information locally in the operating-system user-data directory. Depending on the features you use, this may include open-tab/session information, bookmarks, browsing history, download metadata, theme and homepage preferences, and the selected search provider.

The password vault is available only when Electron's OS-backed secure-storage facility is supported and available. Browser C is designed not to store passwords in plaintext when that facility is unavailable. Do not assume this prototype has undergone an independent security audit.

### Private tabs

Private tabs use an isolated, non-persistent browser session and are excluded from the saved session and browsing history. Private mode is not anonymity. Websites and network operators may still observe requests; downloads you explicitly save remain on disk; and screenshots, copied content, or information you submit can leave traces elsewhere.

### Information sent to other services

When you visit a website, the website receives the information normally associated with your connection and browser request. Search queries are sent to the selected search provider. If you use the built-in translation action, the current page URL is sent to Google Translate. Downloads are retrieved from their source websites. Those services have their own privacy policies and practices; Browser C does not control them.

Browser C does not provide a Browser C account, hosted browsing synchronization, or a Browser C cloud profile service in this release. Do not assume that locally stored data is backed up or synchronized.

### Diagnostics and telemetry

Do not assume that this prototype has comprehensive telemetry controls or a mature diagnostics program. Review the source and release-specific documentation for current behavior. If you report a problem, submit only the logs and details needed to reproduce it, and remove credentials, cookies, personal data, and private browsing information first.

## Project website

The official landing page is hosted at https://browser-c.vercel.app and uses Vercel Analytics. The hosting provider may process technical request information under its own terms and privacy documentation. The website provides links to GitHub and release assets; those services may receive information when you follow those links.

## Retention and deletion

Desktop profile data remains on your device until it is deleted by the user or by an operating-system/application action. Uninstalling Browser C may not remove its user-data directory. Back up or delete profile data using your operating system's file-management tools, taking care not to expose it to others.

## Children

Browser C is not designed specifically for children and does not knowingly collect children's personal information through a Browser C account service.

## Changes and contact

This notice may be updated as the application and website evolve. For privacy questions or concerns, contact the maintainer through the project's verified GitHub profile or repository.

This document describes current intended behavior and is not legal advice or a promise that the prototype is suitable for regulated or sensitive workloads.
