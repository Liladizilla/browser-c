#!/usr/bin/env bash
set -euo pipefail

app="\${1:-}"
if [[ -z "$app" || ! -d "$app" ]]; then
  echo "Usage: $0 /path/to/Browser C.app" >&2
  exit 2
fi

binary="$app/Contents/MacOS/Browser C"
if [[ ! -x "$binary" ]]; then
  echo "Packaged Electron executable is missing or not executable: $binary" >&2
  exit 1
fi

log="$RUNNER_TEMP/browser-c-installed-smoke.log"
: > "$log"
export BROWSER_C_SMOKE=1
"$binary" >"$log" 2>&1 &
app_pid=$!
markers=(
  BROWSER_C_UI_SMOKE_PASS
  BROWSER_C_NAVIGATION_SMOKE_PASS
  BROWSER_C_NAVIGATION_ERROR_RECOVERY_PASS
  BROWSER_C_REDIRECT_SMOKE_PASS
  BROWSER_C_PRIVATE_SESSION_ISOLATION_PASS
  BROWSER_C_BACKGROUND_ERROR_ISOLATION_PASS
  BROWSER_C_OFFLINE_RECOVERY_PASS
  BROWSER_C_RENDERER_CRASH_RECOVERY_PASS
)
deadline=$((SECONDS + 90))
missing=("\${markers[@]}")
cleanup() {
  if kill -0 "$app_pid" 2>/dev/null; then
    kill "$app_pid" 2>/dev/null || true
  fi
  wait "$app_pid" 2>/dev/null || true
}
trap cleanup EXIT

while (( SECONDS < deadline )); do
  if ! kill -0 "$app_pid" 2>/dev/null; then
    cat "$log"
    echo "Installed macOS app exited before completing smoke checks." >&2
    exit 1
  fi
  missing=()
  for marker in "\${markers[@]}"; do
    grep -q "$marker" "$log" || missing+=("$marker")
  done
  if (( \${#missing[@]} == 0 )); then
    echo "Installed macOS app passed all smoke markers."
    exit 0
  fi
  sleep 1
done

cat "$log"
echo "Installed macOS app timed out. Missing markers: \${missing[*]}" >&2
exit 1
