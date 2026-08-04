# Urban Update launcher.
# Decrypts your DPAPI-encrypted Anthropic API key (if present) into THIS process
# only, runs the full refresh, and opens the dashboard.
#
# This script contains NO secret and is safe to commit. The key lives encrypted,
# outside the repo, at:  $HOME\.urban-update\key.dpapi
#
# ONE-TIME SETUP (run once in PowerShell; you'll be prompted, input is hidden):
#   New-Item -ItemType Directory -Force "$HOME\.urban-update" | Out-Null
#   (Read-Host 'Paste your Anthropic API key' -AsSecureString | ConvertFrom-SecureString) | Set-Content "$HOME\.urban-update\key.dpapi"
#
# THEN, any time you want to launch Urban Update:
#   .\run.ps1

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

$keyFile = Join-Path $HOME '.urban-update\key.dpapi'
if (Test-Path -LiteralPath $keyFile) {
  try {
    $sec = Get-Content -LiteralPath $keyFile | ConvertTo-SecureString   # DPAPI: only this user + machine can decrypt
    $env:ANTHROPIC_API_KEY = [System.Net.NetworkCredential]::new('', $sec).Password
    Write-Host 'API key loaded (encrypted at rest) - the AI Brief will regenerate.' -ForegroundColor Green
  } catch {
    Write-Warning 'Could not decrypt the saved key (wrong user/machine, or file corrupt). Continuing without it; the Brief keeps its last version.'
  }
} else {
  Write-Host 'No saved key found - building everything except a fresh Brief. See the one-time setup at the top of this script.' -ForegroundColor Yellow
}

node src/refresh.mjs
if ($LASTEXITCODE -eq 0) { Start-Process (Join-Path $PSScriptRoot 'dashboard\index.html') }
