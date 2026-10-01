# Changelog

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
