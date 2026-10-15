# Browser C security model

## Trust boundaries

- The local browser chrome is a privileged application surface. Its preload exposes only named browser actions through `contextBridge`.
- Visited websites are separate `WebContentsView` instances with Node integration disabled, context isolation enabled, sandboxing enabled, and web security enabled.
- The browser denies website-created windows by default. A future tab/popup policy must be explicit and tested before relaxing this.
- Navigation accepts HTTP and HTTPS only. Address input without a URL is treated as a search query.
- Unsupported permissions and requests from insecure origins are denied. Supported permission requests use native prompts, with grants scoped to the requesting Electron session and current app run.
- The local chrome renderer has a restrictive Content Security Policy and no remote script or connection permissions.
- Private tabs use a unique non-persistent Electron session. Their URLs are excluded from saved session state and browsing history; private completed downloads are not written to the profile. Closing a private tab cancels its active downloads and requests session storage/cache clearing.

## Current limitations

This is an early prototype, not a security-reviewed replacement for a mature browser. Private-mode runtime leakage tests, full OS smoke tests, certificate UI, password storage, extension support, and hardened installer/update channels are still outstanding. Files explicitly downloaded from a private tab are saved to the path selected by the user and remain on disk; private mode does not erase those files or conceal network activity from websites, employers, ISPs, or network administrators.

## Review checklist

- Never enable Node integration for remote content.
- Do not expose generic IPC, filesystem, shell, or arbitrary JavaScript execution to the renderer.
- Validate all renderer-to-main inputs and restrict navigation to expected schemes.
- Keep Electron on a supported, patched stable release.
- Test navigation, permission denial, popup blocking, downloads, private-data leakage, and process crashes before release.
