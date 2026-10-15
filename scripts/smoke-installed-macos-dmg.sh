#!/usr/bin/env bash
set -euo pipefail

dmg="${1:-}"
if [[ -z "$dmg" || ! -f "$dmg" ]]; then
  echo "Usage: $0 /path/to/Browser-C.dmg" >&2
  exit 2
fi

mountpoint="$RUNNER_TEMP/browser-c-dmg-mount"
installed_app="$RUNNER_TEMP/BrowserC-DMG-Smoke.app"
mkdir -p "$mountpoint"
cleanup() {
  hdiutil detach "$mountpoint" -quiet -force >/dev/null 2>&1 || true
  rm -rf "$mountpoint" "$installed_app"
}
trap cleanup EXIT

hdiutil attach "$dmg" -readonly -nobrowse -mountpoint "$mountpoint" >/dev/null
app="$(find "$mountpoint" -maxdepth 3 -type d -name '*.app' -print -quit)"
if [[ -z "$app" ]]; then
  echo "DMG did not contain an application bundle." >&2
  find "$mountpoint" -maxdepth 3 -print >&2
  exit 1
fi

test -f "$app/Contents/Info.plist"
test -f "$app/Contents/Resources/app.asar"
ditto "$app" "$installed_app"
hdiutil detach "$mountpoint" -quiet
bash scripts/smoke-installed-macos.sh "$installed_app"
echo "macOS DMG mount, copy-to-install-location, and launch smoke test passed."
