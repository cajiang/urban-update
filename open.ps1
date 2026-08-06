# Urban Update — check-on-open launcher.
#
# Double-click this (or run `.\open.ps1`) to open the dashboard. At most ONCE PER
# DAY it will: check every source for new data → if anything changed, refresh and
# regenerate the AI Brief → run BOTH brief verifiers (deterministic grounding +
# adversarial AI pressure-test) → then open the dashboard. You never run a command
# by hand, and the Anthropic key stays DPAPI-encrypted (never seen by the coding
# assistant).
#
# Publishing is EARNED, not automatic: the rebuilt dashboard is committed + pushed
# only with -Publish AND only when both verifiers pass. Without -Publish it just
# refreshes locally.
#
#   .\open.ps1              # check-on-open (once/day), local only
#   .\open.ps1 -Force       # refresh now regardless of the day / source check
#   .\open.ps1 -Publish     # also commit+push IF both verifiers pass
#
# One-time key setup is documented in run.ps1's header (shared DPAPI key file).

param(
  [switch]$Force,
  [switch]$Publish
)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

$stateDir = Join-Path $HOME '.urban-update'
$stamp    = Join-Path $stateDir 'lastcheck.txt'
$dash     = Join-Path $PSScriptRoot 'dashboard\index.html'
$today    = (Get-Date).ToString('yyyy-MM-dd')

# Keys into THIS process only. Anthropic = DPAPI-encrypted; Census = user env var.
$keyFile = Join-Path $stateDir 'key.dpapi'
if (Test-Path -LiteralPath $keyFile) {
  try {
    $sec = Get-Content -LiteralPath $keyFile | ConvertTo-SecureString
    $env:ANTHROPIC_API_KEY = [System.Net.NetworkCredential]::new('', $sec).Password
  } catch { Write-Warning 'Could not decrypt the saved Anthropic key; the Brief will keep its last version.' }
}
$census = [Environment]::GetEnvironmentVariable('CENSUS_API_KEY','User')
if ($census) { $env:CENSUS_API_KEY = $census }

# --- once-per-day guard -------------------------------------------------------
$alreadyToday = (Test-Path -LiteralPath $stamp) -and ((Get-Content -LiteralPath $stamp -Raw).Trim() -eq $today)
if ($alreadyToday -and -not $Force) {
  Write-Host "Already checked today ($today) - opening the current dashboard." -ForegroundColor DarkGray
  if (Test-Path -LiteralPath $dash) { Start-Process $dash }
  return
}

# --- source freshness gate ----------------------------------------------------
Write-Host 'Checking sources for new data...' -ForegroundColor Cyan
node src/check-sources.mjs
$srcExit = $LASTEXITCODE   # 0 = up to date, 10 = updates available, 2 = error

if ($srcExit -eq 2) { Write-Warning 'Source check errored; opening the current dashboard without refreshing.'; if (Test-Path $dash) { Start-Process $dash }; return }

if ($srcExit -ne 10 -and -not $Force) {
  Write-Host 'All sources up to date - no refresh needed.' -ForegroundColor Green
  New-Item -ItemType Directory -Force $stateDir | Out-Null
  Set-Content -LiteralPath $stamp -Value $today
  if (Test-Path -LiteralPath $dash) { Start-Process $dash }
  return
}

# --- refresh (regenerates data + the AI Brief) --------------------------------
Write-Host 'New data found - refreshing all feeds and regenerating the Brief...' -ForegroundColor Cyan
node src/refresh.mjs
if ($LASTEXITCODE -ne 0) { Write-Warning 'Refresh failed - leaving the last good dashboard in place.'; if (Test-Path $dash) { Start-Process $dash }; return }

# --- verification: both must pass before anything can publish -----------------
Write-Host 'Verifying the Brief (deterministic grounding)...' -ForegroundColor Cyan
node src/verify-brief.mjs
$verifyPass = ($LASTEXITCODE -eq 0)

Write-Host 'Pressure-testing the Brief (adversarial AI audit)...' -ForegroundColor Cyan
node src/pressure-test.mjs
# Read the audit verdict from disk (present only if the key was available and it ran).
$auditVerdict = 'skipped'
$auditFile = Join-Path $PSScriptRoot 'data\processed\brief-audit.json'
if (Test-Path -LiteralPath $auditFile) {
  try { $auditVerdict = (Get-Content -LiteralPath $auditFile -Raw | ConvertFrom-Json).verdict } catch { $auditVerdict = 'unknown' }
}
$auditPass = ($auditVerdict -eq 'pass')

New-Item -ItemType Directory -Force $stateDir | Out-Null
Set-Content -LiteralPath $stamp -Value $today

Write-Host ''
Write-Host ("Verification: grounding={0}  pressure-test={1}" -f ($(if($verifyPass){'PASS'}else{'FLAGGED'})), $auditVerdict.ToUpper()) -ForegroundColor $(if ($verifyPass -and $auditPass) { 'Green' } else { 'Yellow' })

# --- gated publish ------------------------------------------------------------
if ($Publish) {
  if ($verifyPass -and $auditPass) {
    Write-Host 'Both verifiers passed - publishing to GitHub...' -ForegroundColor Green
    git add -A
    git commit -q -m "Daily refresh $today - verified Brief (grounding + pressure-test passed)"
    git push origin main
    Write-Host 'Published.' -ForegroundColor Green
  } else {
    Write-Warning 'Verification did not fully pass - NOT publishing. Review data\processed\brief-verify.json and brief-audit.json. Refreshed locally only.'
  }
} else {
  Write-Host 'Refreshed locally (no -Publish flag). Review the verifier reports, then re-run with -Publish to push.' -ForegroundColor DarkGray
}

if (Test-Path -LiteralPath $dash) { Start-Process $dash }
