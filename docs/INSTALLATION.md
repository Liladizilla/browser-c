# Install and upgrade Browser C

Browser C is an early desktop browser prototype. Releases are marked as prereleases while cross-platform device testing, code signing/notarization, and upgrade/uninstall checks remain incomplete. Download only from the [official GitHub Releases page](https://github.com/Liladizilla/browser-c/releases).

## Choose a package

| Platform | Package | Notes |
| --- | --- | --- |
| Linux x86_64 | `.AppImage` | Portable; recommended for initial Fedora testing |
| Debian/Ubuntu x86_64 | `.deb` | Installs through the system package manager |
| Windows x64 | `.exe` | NSIS installer |
| macOS | `.dmg` or `.zip` | Signing/notarization and manual Mac testing are still outstanding |

Only use a package matching your operating system and CPU architecture. Release files include `SHA256SUMS.txt` and `SBOM.spdx.json`.

## Linux: AppImage (Fedora and other distributions)

1. Download the AppImage and `SHA256SUMS.txt` from the same release.
2. Open a terminal in the download folder and verify the downloaded release files:

   ```sh
   sha256sum --check SHA256SUMS.txt
   ```

   This checks every file named in the manifest. If you downloaded only one asset, download the remaining assets listed in the manifest or compare that file's hash manually.

3. Make the AppImage executable and launch it:

   ```sh
   chmod +x Browser.C-0.2.1-linux-x86_64.AppImage
   ./Browser.C-0.2.1-linux-x86_64.AppImage
   ```

   Replace the example version/name with the exact downloaded filename.

If the AppImage reports a FUSE error, use the matching `.deb` only on Debian/Ubuntu-based systems, or inspect the AppImage runtime documentation for your distribution. Do not run a downloaded executable with `sudo`.

## Debian/Ubuntu: .deb

Download the `.deb` and install it using your system's package manager, for example:

```sh
sudo apt install ./Browser.C-0.2.1-linux-amd64.deb
```

Replace the example name with the downloaded filename. Use this method only on a compatible Debian/Ubuntu-based distribution.

## Windows

Download the x64 `.exe` installer, verify its SHA-256 hash against `SHA256SUMS.txt`, then run the installer as your normal user. Windows code signing is not yet configured, so Windows may display an unfamiliar-app warning. Do not bypass a warning unless you have verified the download and understand the risk.

## macOS

Download the `.dmg` or `.zip` matching your Mac's architecture. Verify the checksum before opening it. macOS signing/notarization is not yet configured and Gatekeeper may warn or block launch. Do not disable system security globally to run this prototype.

## Upgrade and profile data

Back up any Browser C profile data you care about before replacing an installation. Automated profile migration, upgrade, rollback, and uninstall-retention tests are not yet release gates, so do not assume older profile data can always be migrated safely. Uninstalling the application may not remove profile data from your user directory.

## Verify checksums and provenance

On Linux/macOS, run:

```sh
sha256sum --check SHA256SUMS.txt
```

On Windows PowerShell, calculate a file hash with:

```powershell
Get-FileHash .\Browser.C-0.2.1-win-x64.exe -Algorithm SHA256
```

Compare the output to the corresponding entry in `SHA256SUMS.txt`. A checksum detects mismatches or accidental corruption but does not independently prove who built the file. Where GitHub CLI is available, use the attestation verification command documented in [Release engineering](RELEASES.md).

## First-run smoke test

- Confirm the app opens without a blank window.
- Open a few HTTPS pages and test back, forward, reload, and address/search.
- Open Settings, Bookmarks, History, Downloads, and Passwords. Confirm panels appear in front of the browser content and long panels scroll internally.
- Test a website popup/sign-in flow that you trust. Some providers may reject embedded browser contexts.
- Resize and maximize the window; check that the toolbar remains visible and page content scrolls independently.
- Close and reopen the browser to check session behavior.

If it fails, launch the app from a terminal and preserve the full error output when reporting a bug. Do not put passwords, cookies, or private browsing data in a bug report.
