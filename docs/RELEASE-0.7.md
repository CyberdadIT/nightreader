# NightReader 0.7: security hardening, safer notes, and the 0.6 review gaps

0.7 fixes the findings from the 0.6 security review (M1–M5, L1–L10, and I1, I3 and I4) and closes most of the review's "gaps and grey areas". This release includes the 0.6 work from pull requests #4 and #5.

## Security fixes

| ID | Finding | What changed |
|---|---|---|
| M1 | No Content Security Policy | One policy (`csp.config.js`) is used by the Windows app (`tauri.conf.json`) and injected into the web/phone build. `script-src 'self' 'wasm-unsafe-eval'` (no `unsafe-eval`). Connections are limited to the app, GitHub's API (update check) and jsDelivr (OCR language packs). `object-src`, `frame-src`, `base-uri` and `form-action` are `'none'`. Browser tests run against the production build and fail on any CSP violation. |
| M2 | Tampered sync file could delete or plant notes | Timestamps more than 5 minutes in the future are treated as "now". Sync stops and asks before removing 5 or more notes ("Keep mine" / "Remove them"). A snapshot of your notes is saved before any removal and can be restored from Settings. |
| M3 | Android backups included documents and notes | `allowBackup="false"`, `fullBackupContent="false"`, and `dataExtractionRules` exclude everything from cloud backup and device-to-device transfer. |
| M4 | Release workflows used movable action tags with write access | Every action is pinned to a commit SHA with its version as a comment. Dependabot updates the pins. Checkouts don't keep credentials, and release builds use no caches. |
| M5 | Build tools carried critical/high advisories | Toolchain upgraded (Vite 8, Vitest 5, Capacitor 8, Tauri 2.12). `npm audit` reports 0 vulnerabilities. A new CI audit job fails on any npm advisory rated high or above and on any RustSec vulnerability. |
| L1 | Opener could open any URL and reveal any path | The web page can open only the project's GitHub pages. Links inside documents go through a native command that shows the address and asks before opening (http, https and mailto only). Reveal-in-folder was removed. |
| L2 | EPUB ids could spoof the desktop check | Book ids get a `user-content-` prefix and classes a `bk-` prefix. The desktop check now looks for the Tauri `invoke` function, not just a name. |
| L3 | Text from password-protected PDFs stored in the clear | OCR results for protected PDFs stay in memory only. Their notes and bookmarks are kept out of the sync file. |
| L4 | PDF.js eval support on | `isEvalSupported: false` and `enableScripting: false`. |
| L5 | Unneeded Android permissions; FileProvider exposed shared storage | Only `INTERNET` remains. Sharing is limited to the app's cache folder. |
| L6 | Update link not checked | Only `https://github.com/CyberdadIT/nightreader/…` is accepted; release names are length-limited. |
| L7 | Markdown export didn't escape HTML | Quotes and notes are escaped. |
| L8 | PowerShell launched by name | Full `System32\WindowsPowerShell\v1.0\powershell.exe` path. |
| L9 | Setup script ran installers unchecked | SHA-256 and Microsoft Authenticode checks before anything runs; Rust comes from winget. |
| L10 | Window could navigate to other sites | A navigation guard allows only the app's own origin (plus the dev server in development). |
| I1 | Rust advisories | quick-xml updated to 0.41 (fixes RUSTSEC-2026-0194 and -0195). `cargo audit` now finds no vulnerabilities. Two "unsound/unmaintained" warnings remain in Linux-only GTK crates that aren't in the Windows build. |
| I3 | Android target API 34 | Target and compile SDK 36, minimum 24. |
| I4 | Two release workflows on every tag | The duplicate Windows-only workflow was removed. |

The hostile EPUB used in the review (scripts, event handlers, remote images and CSS, `<base>`, meta refresh, mXSS and DOM-clobbering attempts) is now a permanent browser test, run with publisher styles switched on.

## Gaps closed

- **PDF links.** Contents links jump within the document. Web links show the address and ask first. Links can't navigate the app window, including with middle-click or Ctrl+click.
- **PDF forms.** Text fields, checkboxes and other fields can be filled in. ☰ Notes → *Save filled form copy* writes them into a new PDF; the original is unchanged. Form scripts don't run.
- **Printing.** ⎙ Print or Ctrl+P: this page, a range, or the whole document (up to 300 pages per job). PDF pages print at about 150 dpi in their real colours with any form values. EPUB chapters print as plain text. Phones hand the PDF to the share sheet, which has Print.
- **EPUB contents.** The book's own navigation document (EPUB 3) or NCX (EPUB 2) is used, with nested sections; entries jump to the right place in the chapter.
- **EPUB layouts.** Right-to-left books turn pages the other way (swipes and arrow keys). Fixed-layout books are drawn at their own page size and scaled to fit. *Use the book's own styles* (off by default) applies the publisher's CSS after sanitising it: typography and layout properties only, no `url()`, `@import` or `@font-face`, no `position: fixed`, every rule scoped to the chapter, and the chapter container clips what it draws. In dark themes the book's colours give way to the reader's.
- **Notes can't be lost as easily.** Settings → Backup saves one `.zip` with the library list, notes, bookmarks and settings, optionally with the documents. Restore never deletes: it adds what's missing and keeps the newer copy. Each restored document must match its SHA-256 identity or it's skipped. Deleting a note shows *Undo*. The app asks the system to keep its storage, and Settings shows whether it did.
- **Crashes.** A crash shows a screen with *Back to library* (closes the document that was open), *Reload* and *Copy error details*. Errors are kept in a local log (last 30, stays on the device).
- **Sync on phones and for bookmarks.** Phones use the same sync file as Windows: Settings → *Open sync file…*, pick `nightreader-sync.json` from OneDrive/Google Drive/iCloud, then save the merged copy back from the share sheet. The same merge rules and removal confirmation apply. Bookmarks now sync on all devices.
- **Open with on phones.** Android accepts PDFs and EPUBs from Files, email and other apps (content and file URIs). iOS declares PDF and EPUB document types. The file type is checked from its bytes, not its name.
- **OCR languages.** 22 languages can be downloaded in Settings → Text recognition (Arabic, Chinese Simplified/Traditional, Czech, Dutch, French, German, Greek, Hebrew, Hindi, Indonesian, Italian, Japanese, Korean, Polish, Portuguese, Russian, Spanish, Swedish, Turkish, Ukrainian, Vietnamese). Packs come from a pinned npm release on jsDelivr, are 0.6–3 MB each, and must match a SHA-256 recorded in the app (computed from the npm package). The OCR worker reads the verified copy and never downloads language data itself.
- **Accessibility.** axe-core checks (WCAG 2.1 A/AA) on the library, PDF and EPUB reading screens and dialogs, on desktop and phone layouts. Fixed: document tabs are now a list of buttons with separate close buttons, the reading area can be focused and scrolled from the keyboard, and sidebar thumbnails, contents and bookmarks are real buttons.
- **Dead code.** `src/hooks/usePdfDocument.js` removed.

## Limits

- **Code signing (I2).** Installers are still unsigned, so SmartScreen may warn. This needs a code-signing certificate (for example through SignPath's free open-source programme), which has to be set up by the project owner.
- **Phone sync is manual.** Fully automatic folder sync on phones needs native Storage Access Framework (Android) and security-scoped bookmark (iOS) plugins. The sync-file exchange works today with the same safety checks.
- **Real devices.** Android and iOS were tested with emulated phone layouts in the browser, not on real phones. "Open with", printing from the share sheet and phone sync need a device check before a store release.
- **Screen readers.** Automated checks catch roughly a third of real accessibility problems. A Narrator (Windows) and TalkBack (Android) pass is still needed.
- **Interface language and dictionary** are English only. OCR is no longer English only.
- **Android release minification** is still off.
- Notes on password-protected PDFs quote the document's text and are stored unencrypted on the device (they no longer leave it).
- Publisher styles don't load web fonts or background images (by design).

## Validation recorded

- Unit tests: 70 passed. New in 0.7: backup validation, merge and restore (including a forged document and path-traversal names), opened-file detection, publisher-CSS scoping and filtering, print ranges, OCR pack verification, "Keep mine" sync, the crash screen, and regression tests for every review finding that can be tested in code.
- Rust tests: 5 passed (navigation allowlist and external-link checks added).
- Browser tests against the production build with CSP (Chromium, desktop and Android layouts): 57 passed, 3 skipped (keyboard-only and print tests on the phone layout). New: PDF links and forms, print, undo, backup/restore to a fresh profile, phone sync file with the removal question, OCR pack checksum refusal, error log, publisher styles, EPUB contents and anchors, right-to-left fixed layout, the hostile EPUB, and axe-core audits.
- Checked by hand: a French OCR pack downloaded, verified and used to OCR a scanned page with no further network requests.
- `npm audit`: 0 vulnerabilities. `cargo audit`: 0 vulnerabilities (2 warnings in Linux-only crates).
