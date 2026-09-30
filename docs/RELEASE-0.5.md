# NightReader 0.5: reading and study tools

## Delivered features

- Retained local library for PDF and DRM-free EPUB, collections, search and saved reading position. Closing a tab keeps the file. Removing a library entry explicitly removes its cached bytes, notes and OCR; the original file is untouched.
- Content-based document identity prevents filename collisions. Earlier cached sessions, bookmarks and annotation records migrate on startup. An original file must be imported again if an older version already deleted its cache.
- Visible highlights, underline, strikeout and notes, with persistent anchors and an editable notes panel. Click a saved quotation to jump to its page/chapter. PDF anchors are stored in PDF coordinates so zoom/rotation do not move the marks. Legacy annotations without coordinates use their saved quotation to find the passage; identical repeated quotations may need re-selection.
- Markdown and printable HTML notes export, including page/chapter references. Windows uses a native save dialog; Android/iOS use the native share sheet. Open the HTML export in a browser or other HTML viewer to print or save as PDF. This release does not embed annotations into the original PDF.
- PDF fit to width/page, rotation, two-page reading, and continuous scrolling. Offscreen canvas allocations are released and canvas pixel counts capped. Thumbnails remain capped at the first 50 pages.
- Current-page/chapter read aloud, voice selection and speed controls. Windows uses installed SAPI voices through Windows PowerShell; Android/iOS use their native speech engines. Pause stops the current chunk; resume repeats it. Installed voice availability varies by device; voices labelled online can require network access. Continuous reading across pages is not included in this release.
- English OCR for scanned PDFs, on the current page or all pages sequentially. Worker, WebAssembly and English language data are packaged locally. Results are cached locally and used for selection, search and speech. Pages with existing text are skipped. OCR is an approximation; review quotations before using them. The original PDF is not rewritten with an OCR layer.
- DRM-free, reflowable EPUB chapters, font choices, size/spacing controls, search, notes, embedded raster images and internal chapter links. Scripts, external media, publisher CSS and embedded frames are removed. Encrypted resources, fixed-layout fidelity and publisher styling are not supported.
- Debounced, cancellable search with visible matches. Scanned documents become searchable after OCR.

## Platform priority

Windows, Android and iOS are the release targets. Linux release builds are deferred. Ubuntu CI runs JavaScript/browser validation only.

Android now has a complete Gradle project and wrapper. iOS now has a complete Xcode project and CocoaPods configuration. Native plugins are included for speech, file export and sharing. Build failures are reported rather than hidden.

## Build and validation

Use Node.js 22 and `npm ci`. Run `npm test`, `npm run build`, then `npx playwright install --with-deps chromium webkit` and `npm run test:e2e`. OCR assets are generated during development/build; no runtime CDN is required.

Windows: install Rust and Visual Studio C++ build tools, then `npm run tauri:build -- --config src-tauri/tauri.windows.conf.json`. Test installed voices, stop/resume, the save dialog, PDFs with 100+ pages and touch selection on Windows hardware. Windows PowerShell and System.Speech must be installed/enabled for native speech.

Android: install Android Studio/JDK 17, run `npm run build`, `npx cap sync android`, then `android/gradlew assembleDebug` (or `gradlew.bat` on Windows). The review workflow produces a debug APK. A store release needs a signed release build and current store-target/API requirements checked separately.

iOS: on macOS with Xcode and CocoaPods, run `npm run build`, `npx cap sync ios`, then open `ios/App/App.xcworkspace`. CI builds an unsigned simulator app. Installation on an iPhone, TestFlight and App Store distribution require Apple signing/provisioning and account setup; an unsigned simulator build is not a distributable IPA.

## Device acceptance checklist

1. Import a PDF and EPUB through Files/the native picker; close/reopen and restart the app to verify document and reading position retention.
2. Select text with mouse, finger and long press; highlight, edit a note, rotate/zoom/reflow, and reopen. Check the mark stays on the correct quotation.
3. Export Markdown and HTML through the Windows save dialog and mobile share sheet.
4. Read aloud with an installed voice; pause/resume/stop; change document while speaking.
5. Run English OCR offline, search/copy recognized text, cancel a long OCR run, and restart to verify caching.
6. Read a large scanned PDF and a 100+ page text PDF in scroll mode, monitoring memory.
7. Verify phone portrait/landscape, tablet split view, safe-area insets and keyboard focus.

Browser emulation checks rendering and UI flows; it does not replace these native-device checks.

## Implementation validation recorded

- Production frontend build: passed.
- ESLint syntax/control-flow checks: passed.
- Unit tests: 10 passed (storage retention, identity/migration, scoped OCR deletion, EPUB sanitization, export escaping, search offsets, fit geometry and speech chunk bounds).
- Chromium browser flow tests: 8 passed across desktop and Android-sized touch layouts (PDF notes/export/search/rotation/spread/reopen, EPUB reflow/notes/navigation/search, offline English OCR and offscreen canvas release).
- Android/iOS Capacitor synchronization: passed with all four native plugins detected. Local iOS synchronization skipped CocoaPods and Xcode steps because those tools are unavailable here.
- iOS WebKit/browser tests and native Windows/Android/iOS compilation and hardware checks: pending. Browser downloads were unavailable in the execution environment; Chromium was run with a locally extracted test binary. Native build workflows and device acceptance steps are included.
