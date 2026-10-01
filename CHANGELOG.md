# Changelog

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
