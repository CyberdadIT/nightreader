# ☽ NightReader — Windows Edition

This package contains everything needed to build and run NightReader on Windows.

---

## Why is there no .exe included?

NightReader uses **Tauri**, which compiles a tiny Rust backend specifically for
your machine. This means:

- The final installer is **~5 MB** (vs ~150 MB for Electron apps)
- It uses the built-in Windows WebView2 (Edge engine) — no browser bundled
- It must be compiled once on a Windows machine

The compilation takes **5–15 minutes the first time** (Rust compiles from scratch).
Every build after that takes about 30 seconds (cached).

---

## Quick start (3 steps)

### Step 1 — Install prerequisites (one time only)

Open **PowerShell as Administrator** and run:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
.\install-prerequisites.ps1
```

This installs automatically:
- Node.js 20 LTS
- Rust (stable, MSVC toolchain)
- Visual C++ Build Tools
- Microsoft WebView2 Runtime

Or install manually — see **Manual prerequisites** below.

---

### Step 2 — Build the installer

Double-click **`build-windows.bat`** (or run it in a terminal).

When it finishes you will find:

```
src-tauri\target\release\bundle\
  msi\
    NightReader_0.1.0_x64_en-US.msi    ← Windows Installer package
  nsis\
    NightReader_0.1.0_x64-setup.exe    ← Standalone setup wizard
```

Distribute either file. Both install NightReader to `%PROGRAMFILES%\NightReader`.

---

### Step 3 — Install and run

Double-click the `.msi` or `.exe` file on any Windows 10 / 11 machine.

> **Note:** Windows Defender SmartScreen may warn about an unsigned app.
> Click **"More info" → "Run anyway"**.
> To remove this warning permanently, code-sign the installer
> (see **Code signing** below).

---

## Development mode

To run the app with hot-reload while editing the source code:

```bat
dev-windows.bat
```

Or in a terminal:

```bash
npm install
npm run tauri:dev
```

The Tauri window opens automatically. Edit any file in `src/` and the app
updates instantly without rebuilding.

---

## Manual prerequisites

If you prefer to install manually rather than using the PowerShell script:

| Tool | Download | Notes |
|---|---|---|
| **Node.js 20 LTS** | https://nodejs.org | Choose the LTS installer |
| **Rust** | https://rustup.rs | Run `rustup-init.exe`, choose default install |
| **Visual C++ Build Tools** | https://aka.ms/vs/17/release/vs_BuildTools.exe | Select "Desktop development with C++" |
| **WebView2 Runtime** | https://developer.microsoft.com/en-us/microsoft-edge/webview2/ | "Download the Evergreen Bootstrapper" |

After installing, open a **new** terminal and verify:

```cmd
node --version      # should print v20.x.x
cargo --version     # should print cargo 1.x.x
```

---

## Output files explained

| File | Purpose |
|---|---|
| `NightReader_x.x.x_x64_en-US.msi` | Windows Installer — best for IT/enterprise deployment, silent install supported |
| `NightReader_x.x.x_x64-setup.exe` | NSIS wizard — best for end-user distribution, familiar install experience |
| `NightReader.exe` (in release/) | Portable executable — no install needed, just double-click |

---

## Silent / enterprise installation

```cmd
:: Silent MSI install (no UI)
msiexec /i NightReader_0.1.0_x64_en-US.msi /quiet /norestart

:: Silent MSI uninstall
msiexec /x NightReader_0.1.0_x64_en-US.msi /quiet /norestart
```

---

## Code signing (optional, removes SmartScreen warning)

To sign the installer so Windows trusts it:

1. Buy a code-signing certificate from a CA (e.g. DigiCert, Sectigo, ~$100–300/year).
   Or get a free one via **[SignPath Foundation](https://signpath.org)** for open-source projects.
2. Export it as a `.pfx` file.
3. Set these environment variables before running `build-windows.bat`:

```cmd
set TAURI_SIGNING_PRIVATE_KEY=<path-to-your-key.pem>
set TAURI_SIGNING_PRIVATE_KEY_PASSWORD=<your-password>
```

Or for GitHub Actions, store them as repository secrets — the workflow is
already configured to use them when present.

---

## Updating the app version

Edit the version string in **three places** before building a release:

1. `package.json` → `"version": "0.2.0"`
2. `src-tauri/Cargo.toml` → `version = "0.2.0"`
3. `src-tauri/tauri.conf.json` → `"version": "0.2.0"`

Then tag and push:

```bash
git tag v0.2.0
git push origin v0.2.0
```

GitHub Actions builds the Windows installer automatically and attaches it
to a draft GitHub Release for you to review and publish.

---

## Troubleshooting

| Problem | Solution |
|---|---|
| `cargo: command not found` | Close terminal, reopen, try again. Rust wasn't in PATH yet. |
| `LINK: fatal error LNK1104` | Visual C++ Build Tools missing or incomplete. Re-run `install-prerequisites.ps1`. |
| `WebView2 not found` | Run `install-prerequisites.ps1` or install WebView2 manually. |
| Build succeeds but app is blank | Run `npm run dev` first to confirm the frontend builds, then try `tauri:build` again. |
| SmartScreen blocks installer | Expected for unsigned builds. Click "More info → Run anyway". |
| Antivirus flags the `.exe` | Common false-positive for new unsigned Tauri apps. Add an exclusion or sign the binary. |

---

## Project structure (Windows-relevant parts)

```
nightreader-windows\
├── install-prerequisites.ps1   ← Run once to install all tools
├── build-windows.bat           ← Builds the .msi / .exe installer
├── dev-windows.bat             ← Starts hot-reload dev mode
├── src\                        ← React frontend (edit this)
├── src-tauri\                  ← Rust backend (Tauri)
│   ├── tauri.conf.json         ← Window size, permissions, app name
│   ├── Cargo.toml              ← Rust dependencies
│   └── src\lib.rs              ← Custom Rust commands
├── package.json
└── vite.config.js
```

---

## Licence

GPL v3 — free to use, modify, and distribute. All forks must remain open source.
