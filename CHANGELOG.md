# Changelog

## [Unreleased]

- **Linux desktop app.** .deb (Ubuntu, Debian, Mint), .rpm (Fedora) and AppImage packages, built for every release. It opens PDFs and EPUBs from the file manager. Read aloud uses speech-dispatcher or eSpeak NG, with male and female voices. Each pull request runs a WebDriver smoke test of the real Linux app, covering command-line open, PDF rendering, OCR under the CSP, WebCrypto for the app lock, voices and EPUB. See README-LINUX.md.
- **Dark form controls.** Menus and checkboxes now follow the dark interface. On Linux, drop-down menus were light with unreadable text.
- Android release builds are now signed with your own key (kept in GitHub secrets) and the APK is attached to each GitHub release. Pull requests check the signing setup with a throwaway key. See docs/ANDROID-SIGNING.md.

## [0.8.0] — pen, read along, study and privacy

### Reading
- **Surface Pen ink on PDFs.** Write straight onto the page with a pen; no tool to pick first. Pressure changes the line width, the eraser end removes strokes, and Ctrl+Z undoes. ✒ Ink in the toolbar lets a mouse draw too, with five colours and three thicknesses. Fingers keep scrolling. Strokes sync, go into backups, and are written into annotated PDF copies as standard ink annotations.
- **Read along.** Read aloud now highlights the sentence being read and the current word, and keeps it on screen. Turn it off with "Follow along".
- **More voices.** On Windows, NightReader now uses all installed voices, including male ones (for UK English: George, Hazel and Susan; for US English: David, Mark and Zira), with the language and gender shown in the menu and a ▶ Preview button. More voices can be added in Windows Settings → Time & language → Speech.
- **Side by side.** ◫ Side by side shows two documents, or two places in the same one, each with its own page. Click a pane to make it the one the toolbar and keys control.
- **Tidier toolbar.** Rotate, two pages, continuous scroll, invert, focus, print and reset zoom are now under **More ▾**, so the toolbar fits on one row on smaller screens such as the Surface Pro 4.

### Study
- **Search every document.** Library → Search text finds words across your whole library (PDF text, OCR text and EPUB chapters), with snippets; opening a result shows the matches in the document. Accents and case don't matter.
- **Flashcard review.** Library → Review flashcards: every highlight with a note is a card. Space shows the answer and 1–4 grade it; spaced repetition decides when each card comes back.
- **Reading statistics.** 📊 shows time read today, this week and in total, pages, your streak, a 30-day chart and time per document. Only active reading counts.

### Privacy
- **App lock with encrypted storage.** Settings → App lock: a passphrase protects NightReader, and everything it stores on the device (library, notes, settings, documents, OCR text, snapshots, search index) is encrypted with AES-256-GCM. It locks after a chosen time without use, or with 🔒.
- **Password-protected backups** (AES-256-GCM, separate password).

See docs/RELEASE-0.8.md for details and limits.

## [0.7.0] — security hardening, safer notes, and the gaps from the 0.6 review

### Security (findings from the 0.6 security review)
- Strict Content Security Policy in the Windows app and the web/phone builds; scripts can only come from the app itself.
- The app window can't be navigated to another site, and links inside documents open in your browser only after you confirm.
- Sync files are treated as untrusted: future timestamps are clamped, removing five or more notes asks first, and a snapshot is kept before anything is removed.
- Android: backups and device transfer exclude NightReader's data; unneeded permissions removed; sharing limited to the app's cache.
- Text from password-protected PDFs (OCR results, notes) stays on the device and out of the sync file.
- EPUB content can't shadow app internals (DOM clobbering), PDF.js runs without eval, Markdown exports escape HTML, the update link must point at this project, and PowerShell is launched by full path.
- Build pipeline: GitHub Actions pinned to commit SHAs, Dependabot, no caches or stored credentials in release builds, a dependency audit job (npm and Rust), and one release workflow instead of two. npm audit and cargo audit report no vulnerabilities.
- Setup script checks SHA-256 and Microsoft signatures before running downloaded installers.

### New
- PDF links work: contents links jump inside the document, web links ask before opening.
- Fill in PDF forms and save a filled copy.
- Print (Ctrl+P) through the system print dialog; phones print from the share sheet.
- EPUB: the book's own table of contents with nested sections, right-to-left books, fixed-layout books, and an option to use the book's own styles (sanitised and contained).
- Backup and restore everything in one file, optionally with the documents. Earlier versions of your notes can be restored from snapshots.
- Undo after deleting a note.
- Phones can sync through the same sync file as Windows. Bookmarks now sync on all devices.
- Android and iOS: open PDFs and EPUBs from Files, email and other apps.
- OCR in 22 more languages, downloaded once and checked against fixed checksums.
- A crash screen with a way back to the library, and a local error log you can copy into a bug report.
- Settings show storage use and whether the system may clear it.

### Accessibility
- Automated WCAG 2.1 AA checks (axe-core) on the main screens. Fixed: document tabs, the reading area and sidebar items now work with a keyboard and screen readers.

See docs/RELEASE-0.7.md for details and limits.

## [0.6.0] — easier on Windows, kinder at night, better for study

### Windows
- NightReader now appears under "Open with" for PDF and EPUB files, and double-clicking a file opens it in NightReader when it's your default.
- Opening a second file while NightReader is running adds it as a tab in the same window instead of starting another copy.
- A banner tells you when a new version is on GitHub, with a link to download it. Checked at most once a day; you can turn it off in ⚙ Settings.
- Folder sync: choose a folder such as OneDrive and your reading positions, highlights and notes are kept in step through it.

### Reading
- Mouse wheel now scrolls through a page and turns to the next or previous page at the bottom or top edge, in page-by-page and two-page views. Ctrl + wheel zooms PDFs and resizes EPUB text.
- Touch screens (Surface and other tablets): swipe left or right to turn the page, or swipe up/down past the end of a page. When zoomed in, a swipe pans across the page first. Pinch zooms the PDF (or EPUB text) instead of the whole window.
- A sideways swipe can no longer trigger the web view's "go back" gesture and leave the app.
- Password-protected PDFs ask for their password. It is kept only until you close the app.
- Read aloud carries on to the next page or chapter, skipping blank pages, with a sleep timer (15–90 minutes, or end of the current page/chapter).
- Warm light removes blue light from the whole window, optionally only during evening hours. Brightness goes lower than before.
- The status bar shows how far through you are and roughly how long is left, based on your own reading pace.
- Press ? for a list of keyboard and mouse shortcuts.

### Study
- Define: select a single word to see an offline dictionary entry (WordNet), including common word forms such as "went" → "go".
- All notes: a new Library tab to search every highlight and note across your documents, filter by colour, type or tag, edit notes and jump to the passage.
- Tags on highlights and notes.
- Export flashcards for Anki, from one document or from the All notes view.
- Save an annotated copy of a PDF with your highlights, underlines, strike-outs and notes written in as standard PDF annotations, so they show in Acrobat, Edge and other readers. The original file is not changed.

See docs/RELEASE-0.6.md for details and limits.

## [0.5.0] — reading and study tools

- Added retained PDF/EPUB library and collections, persistent visible annotations, editable notes and note export.
- Added native read aloud, bundled English OCR, PDF fit/rotation/spread and EPUB reflow controls.
- Fixed filename collisions, recent-file retention, offscreen canvas allocations and search match rendering.
- Repaired Android/iOS project scaffolding and added Windows, Android and iOS review builds. Linux release builds deferred.
- See docs/RELEASE-0.5.md for platform checks and limits.


All notable changes to NightReader are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- Initial project scaffold
- Vite + React frontend with CSS Modules
- PDF.js integration for real PDF rendering with text layer
- Five reading modes: Dark, Light, Sepia, AMOLED, Matrix
- Annotations: highlight (4 colours), underline, strikethrough
- Bookmarks with persistent storage via Zustand
- Table of contents from PDF outline
- Find-in-document search bar
- Continuous scroll and single-page modes
- Focus / distraction-free mode
- Font switching: Serif, Sans, Mono
- Fine display controls: font size, line height, margins, brightness
- Drag-and-drop PDF opening
- Recent files list
- Full keyboard shortcut support
- Tauri backend for Windows, Linux, macOS desktop builds
- Capacitor integration for Android and iOS
- SQLite persistence via Tauri plugin-sql (desktop)
- GitHub Actions CI/CD workflows for all platforms

---

## [0.1.0] - TBD

_First public release._
