#Requires -Version 5.1

$Repo = "https://github.com/kamikaze1120/BACLI.git"
$BinName = "bacli"

Write-Host @"
  ╔════════════════════════════╗
  ║    Installing bacli...     ║
  ╚════════════════════════════╝
"@ -ForegroundColor Cyan

# Check prerequisites
try { $nodeVer = node --version } catch {
  Write-Host "✖ Node.js 20+ is required. Install from https://nodejs.org" -ForegroundColor Red
  exit 1
}
$verParts = $nodeVer -replace 'v', '' -split '\.'
if ([int]$verParts[0] -lt 20) {
  Write-Host "✖ Node.js 20+ required (found $nodeVer). Upgrade at https://nodejs.org" -ForegroundColor Red
  exit 1
}

try { $null = git --version } catch {
  Write-Host "✖ git is required. Install from https://git-scm.com" -ForegroundColor Red
  exit 1
}

# Install from GitHub source
$tmpDir = Join-Path $env:TEMP "bacli-install-$([System.IO.Path]::GetRandomFileName())"
New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null

try {
  Write-Host "  → Cloning from GitHub..." -ForegroundColor Cyan
  git clone --depth 1 $Repo $tmpDir 2>&1 | Out-Null

  Push-Location $tmpDir

  Write-Host "  → Installing dependencies..." -ForegroundColor Cyan
  npm install --production 2>&1 | Out-Null

  Write-Host "  → Building..." -ForegroundColor Cyan
  npm run build 2>&1 | Out-Null

  Write-Host "  → Linking globally as '$BinName'..." -ForegroundColor Cyan
  npm link 2>&1 | Out-Null

  Write-Host @"
  ✓ bacli installed successfully!

  Run: $BinName
"@ -ForegroundColor Green
}
finally {
  Pop-Location
  Remove-Item -Recurse -Force $tmpDir -ErrorAction SilentlyContinue
}
