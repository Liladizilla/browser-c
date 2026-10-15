param(
  [Parameter(Mandatory = $true)]
  [string]$InstallerPath
)

$ErrorActionPreference = "Stop"
$installDir = Join-Path $env:RUNNER_TEMP "Browser C Installed Smoke"
$logOut = Join-Path $env:RUNNER_TEMP "browser-c-installed-smoke.stdout.log"
$logErr = Join-Path $env:RUNNER_TEMP "browser-c-installed-smoke.stderr.log"

if (-not (Test-Path -LiteralPath $InstallerPath -PathType Leaf)) {
  throw "Installer does not exist: $InstallerPath"
}
if (Test-Path -LiteralPath $installDir) {
  Remove-Item -LiteralPath $installDir -Recurse -Force
}
$installer = Start-Process -FilePath $InstallerPath -ArgumentList @("/S", "/D=$installDir") -Wait -PassThru
if ($installer.ExitCode -ne 0) {
  throw "NSIS installer failed with exit code $($installer.ExitCode)."
}

$appExe = Join-Path $installDir "Browser C.exe"
if (-not (Test-Path -LiteralPath $appExe -PathType Leaf)) {
  throw "Installed Browser C executable was not found at $appExe"
}

$env:BROWSER_C_SMOKE = "1"
$app = Start-Process -FilePath $appExe -PassThru -RedirectStandardOutput $logOut -RedirectStandardError $logErr
$markers = @(
  "BROWSER_C_UI_SMOKE_PASS",
  "BROWSER_C_NAVIGATION_SMOKE_PASS",
  "BROWSER_C_NAVIGATION_ERROR_RECOVERY_PASS",
  "BROWSER_C_REDIRECT_SMOKE_PASS",
  "BROWSER_C_PRIVATE_SESSION_ISOLATION_PASS",
  "BROWSER_C_BACKGROUND_ERROR_ISOLATION_PASS",
  "BROWSER_C_OFFLINE_RECOVERY_PASS",
  "BROWSER_C_RENDERER_CRASH_RECOVERY_PASS"
)
$deadline = (Get-Date).AddSeconds(90)
try {
  $missing = $markers
  do {
    Start-Sleep -Milliseconds 500
    $combined = ""
    if (Test-Path $logOut) { $combined += Get-Content -Raw $logOut }
    if (Test-Path $logErr) { $combined += Get-Content -Raw $logErr }
    if ($app.HasExited) {
      throw ("Installed browser exited early with code " + $app.ExitCode + [Environment]::NewLine + $combined)
    }
    $missing = @($markers | Where-Object { -not $combined.Contains($_) })
    if ($missing.Count -eq 0) {
      Write-Host "Installed Windows app passed all smoke markers."
      break
    }
  } while ((Get-Date) -lt $deadline)

  if ($missing.Count -gt 0) {
    throw ("Installed Windows app did not complete smoke checks. Missing: " + ($missing -join ", ") + [Environment]::NewLine + $combined)
  }
} finally {
  & taskkill.exe /PID $app.Id /T /F 2>$null | Out-Null
  Remove-Item Env:BROWSER_C_SMOKE -ErrorAction SilentlyContinue
}
