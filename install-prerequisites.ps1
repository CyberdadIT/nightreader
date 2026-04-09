# NightReader - Windows Prerequisites Installer
# Run this script ONCE before building NightReader for the first time.
# Run as Administrator for best results.
#
# Usage (in PowerShell):
#   Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
#   .\install-prerequisites.ps1

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "  ==========================================" -ForegroundColor Cyan
Write-Host "   NightReader - Prerequisites Installer" -ForegroundColor Cyan
Write-Host "  ==========================================" -ForegroundColor Cyan
Write-Host ""

# ── Helper ────────────────────────────────────────────────────────────
function Test-Command($cmd) {
    return (Get-Command $cmd -ErrorAction SilentlyContinue) -ne $null
}

function Write-Step($msg) {
    Write-Host "  >> $msg" -ForegroundColor Yellow
}

function Write-Ok($msg) {
    Write-Host "  [OK] $msg" -ForegroundColor Green
}

function Write-Skip($msg) {
    Write-Host "  [--] $msg (already installed)" -ForegroundColor DarkGray
}

# ── Check if winget is available ──────────────────────────────────────
$hasWinget = Test-Command "winget"

# ── 1. Node.js ────────────────────────────────────────────────────────
if (Test-Command "node") {
    $nodeVer = (node --version)
    Write-Skip "Node.js $nodeVer"
} else {
    Write-Step "Installing Node.js LTS via winget..."
    if ($hasWinget) {
        winget install --id OpenJS.NodeJS.LTS -e --silent --accept-source-agreements --accept-package-agreements
        Write-Ok "Node.js installed"
    } else {
        Write-Host "  [MANUAL] Download Node.js from: https://nodejs.org" -ForegroundColor Magenta
        Write-Host "           Install the LTS version, then re-run this script." -ForegroundColor Magenta
        Read-Host "  Press Enter to continue after installing Node.js"
    }
}

# ── 2. Rust (via rustup) ──────────────────────────────────────────────
if (Test-Command "cargo") {
    $rustVer = (cargo --version)
    Write-Skip "Rust $rustVer"
} else {
    Write-Step "Installing Rust via rustup-init..."
    $rustupUrl  = "https://win.rustup.rs/x86_64"
    $rustupPath = "$env:TEMP\rustup-init.exe"
    Invoke-WebRequest -Uri $rustupUrl -OutFile $rustupPath
    & $rustupPath -y --default-toolchain stable --default-host x86_64-pc-windows-msvc
    # Add Rust to PATH for this session
    $env:PATH += ";$env:USERPROFILE\.cargo\bin"
    Write-Ok "Rust installed"
}

# ── 3. Rust target (just in case) ─────────────────────────────────────
Write-Step "Ensuring x86_64-pc-windows-msvc Rust target..."
rustup target add x86_64-pc-windows-msvc 2>$null
Write-Ok "Rust target ready"

# ── 4. Visual C++ Build Tools (required by Rust on Windows) ──────────
$vcPath = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
if (Test-Path $vcPath) {
    Write-Skip "Visual Studio / Build Tools"
} else {
    Write-Step "Installing Visual C++ Build Tools..."
    if ($hasWinget) {
        winget install --id Microsoft.VisualStudio.2022.BuildTools -e --silent `
            --override "--wait --quiet --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
        Write-Ok "Visual C++ Build Tools installed"
    } else {
        Write-Host "  [MANUAL] Download Build Tools from:" -ForegroundColor Magenta
        Write-Host "           https://aka.ms/vs/17/release/vs_BuildTools.exe" -ForegroundColor Magenta
        Write-Host "           Select 'Desktop development with C++' workload." -ForegroundColor Magenta
        Read-Host "  Press Enter to continue after installing"
    }
}

# ── 5. WebView2 Runtime ───────────────────────────────────────────────
$wv2Key = "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
if (Test-Path $wv2Key) {
    Write-Skip "Microsoft WebView2 Runtime"
} else {
    Write-Step "Installing Microsoft WebView2 Runtime..."
    if ($hasWinget) {
        winget install --id Microsoft.EdgeWebView2Runtime -e --silent --accept-source-agreements --accept-package-agreements
        Write-Ok "WebView2 Runtime installed"
    } else {
        $wv2Url = "https://go.microsoft.com/fwlink/p/?LinkId=2124703"
        $wv2Path = "$env:TEMP\MicrosoftEdgeWebview2Setup.exe"
        Invoke-WebRequest -Uri $wv2Url -OutFile $wv2Path
        Start-Process -FilePath $wv2Path -ArgumentList "/silent /install" -Wait
        Write-Ok "WebView2 Runtime installed"
    }
}

# ── Done ──────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ==========================================" -ForegroundColor Green
Write-Host "   All prerequisites installed!" -ForegroundColor Green
Write-Host "  ==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Next steps:" -ForegroundColor White
Write-Host "    1. Close and reopen PowerShell / terminal" -ForegroundColor White
Write-Host "    2. Double-click  build-windows.bat  to build the installer" -ForegroundColor White
Write-Host "    3. Or run  dev-windows.bat  to start development mode" -ForegroundColor White
Write-Host ""
Read-Host "  Press Enter to exit"
