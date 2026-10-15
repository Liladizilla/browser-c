# Browser C security model

## Trust boundaries

- The local browser chrome is a privileged application surface. Its preload exposes only named browser actions through contextBridge.
- Visited websites are separate WebContentsView instances with Node integration disabled, context isolation enabled, sandboxing enabled, and web security enabled.
- The browser denies website-created windows by default. A future tab/popup policy must be explicit and tested before relaxing this.
- Navigation accepts HTTP and HTTPS only. Address input without a URL is treated as a search query.
- Web permissions are denied by default until a user-facing permission prompt and persistent decision model exist.
- The local chrome renderer has a restrictive Content Security Policy and no remote script or connection permissions.

## Current limitations

This is an early prototype. It does not yet provide a permission prompt, user-managed downloads, certificate UI, password storage, private windows, extension support, or hardened installer/update channels. Do not use it as a security-reviewed replacement for a mature browser yet.

## Review checklist

- Never enable Node integration for remote content.
- Do not expose generic IPC, filesystem, shell, or arbitrary JavaScript execution to the renderer.
- Validate all renderer-to-main inputs and restrict navigation to expected schemes.
- Keep Electron on a supported, patched stable release.
- Test navigation, permission denial, popup blocking, downloads, and process crashes before release.
