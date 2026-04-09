@echo off
setlocal EnableDelayedExpansion

echo.
echo  ==========================================
echo   NightReader - Windows Build Script
echo  ==========================================
echo.

:: ── Check Node.js ────────────────────────────────────────────────────
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js not found.
    echo         Download from: https://nodejs.org  (LTS version recommended)
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do set NODE_VER=%%i
echo [OK] Node.js %NODE_VER%

:: ── Check npm ────────────────────────────────────────────────────────
where npm >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] npm not found. Re-install Node.js.
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('npm --version') do set NPM_VER=%%i
echo [OK] npm %NPM_VER%

:: ── Check Rust ───────────────────────────────────────────────────────
where cargo >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Rust / Cargo not found.
    echo         Download from: https://rustup.rs
    echo         Run the installer, then re-run this script.
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('cargo --version') do set CARGO_VER=%%i
echo [OK] %CARGO_VER%

:: ── Check WebView2 (required by Tauri on Windows) ────────────────────
reg query "HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo.
    echo [INFO] Microsoft WebView2 Runtime not found.
    echo        Tauri will bundle it automatically in the installer.
    echo        Or install manually: https://developer.microsoft.com/en-us/microsoft-edge/webview2/
    echo.
)

echo.
echo  ── Installing frontend dependencies ──────────────────────────────
call npm ci
if %ERRORLEVEL% neq 0 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
)

echo.
echo  ── Building NightReader for Windows ──────────────────────────────
echo  This compiles the Rust backend + bundles the frontend.
echo  First build takes 5-15 minutes (Rust compilation).
echo  Subsequent builds are much faster (cached).
echo.
call npm run tauri:build -- --target x86_64-pc-windows-msvc
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Build failed. See output above for details.
    pause
    exit /b 1
)

echo.
echo  ==========================================
echo   Build complete!
echo  ==========================================
echo.
echo  Installers are in:
echo    src-tauri\target\release\bundle\msi\      (.msi installer)
echo    src-tauri\target\release\bundle\nsis\     (.exe installer)
echo.
echo  The .msi file can be distributed and installed on any Windows 10/11 machine.
echo  The .exe (NSIS) file is a standalone setup wizard.
echo.
pause
