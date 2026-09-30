# NightReader 0.6: Windows integration, night reading and study tools

## What's new

### Windows
- **Open with / double-click.** The installer registers NightReader for `.pdf` and `.epub`. It appears under *Open with*; Windows only makes it the default if you choose that yourself (Settings → Apps → Default apps, or *Open with → Choose another app → Always*).
- **One window.** Opening another file while NightReader is running brings the existing window forward and opens the file as a tab.
- **New-version notice.** Once a day the app asks GitHub for the latest release. If it's newer, a banner offers a download link to the release page. Nothing installs itself. Turn it off in ⚙ Settings → Updates. Only the public GitHub releases API is contacted.
- **Folder sync.** In ⚙ Settings → Sync, choose a folder (OneDrive, Dropbox, a network share). NightReader keeps `NightReader/nightreader-sync.json` there and merges it on start, a few seconds after changes, every minute, and when the window regains focus.

### Reading
- **Mouse wheel** scrolls within a page and turns the page at the top or bottom edge. **Ctrl + wheel** zooms (PDF) or changes text size (EPUB).
- **Password-protected PDFs** prompt for the password; a wrong password asks again. Passwords stay in memory until the app closes and are never saved.
- **Continuous read aloud** moves on to the next page or chapter and skips blank pages. The **sleep timer** stops after 15–90 minutes, or at the end of the current page or chapter.
- **Warm light** is a multiply-blended colour layer over the whole window that cuts blue light (about 2700 K at full strength), with an optional evening schedule. The brightness floor is now 5%.
- **Time left** in the status bar learns your pace: seconds per page for PDFs, words per minute for EPUBs. Only moving forward one page counts, and time with the app in the background is ignored.
- **?** opens the shortcut list.

### Study
- **Define** appears in the selection popup for single words. The dictionary is WordNet 3.0, bundled with the app (about 13 MB installed, 83,000 words) and loaded one letter at a time. It works offline and lookups never leave the device.
- **All notes** (Library → All notes) searches highlights, notes, tags and document names across the library, filters by colour, type and tag, edits notes and tags in place, and jumps to the passage.
- **Anki flashcards**: front is the passage; back is your note plus the book and page. Tags carry over, plus `nightreader` and the book name. In Anki use *File → Import*.
- **Annotated PDF copy** (☰ Notes → Save annotated PDF copy) writes Highlight, Underline, StrikeOut and note annotations with their own appearance streams, so they render the same in other readers. The original file is untouched.

## Limits

- Annotations made before 0.5 that have no stored position are left out of annotated PDF copies (the app says how many). Highlight the passage again to include it.
- Annotated copies can't be made from encrypted PDFs; use the Markdown or HTML export.
- Sync carries reading positions, highlights, notes, tags and collections — not the documents themselves. A document is recognised by its content, so importing the same file on another device brings its notes with it. Bookmarks are not synced yet.
- Sync is Windows-only in this release. Android and iOS support is planned.
- The dictionary is English only.
- Time-left estimates start from a default pace (60 s per PDF page, 230 words per minute) until the app has seen you read a few pages.
- Windows installers are not code-signed yet, so SmartScreen may warn on first run.

## Security notes

- Files opened from Explorer are passed to the web view through a one-time read allowlist in the native layer. The web view has no general file-system access.
- The sync file is treated as untrusted input: it must identify itself as a NightReader sync file, every note is validated and size-capped, and a file that can't be read is left unchanged rather than overwritten. Writes go to a temporary file first and are then renamed into place.
- The only network call is the optional daily release check to `api.github.com`.

## Validation recorded

- Unit tests: 35 passed (version comparison, warm-light schedules across midnight, pace and time-left maths, dictionary word forms and lookups against the real data, notes filtering, Anki escaping, sync merge/deletion/validation, annotated-PDF output, store changes).
- Native unit tests (Rust): 3 passed (command-line document detection, one-time read allowlist, sync path validation).
- Browser tests (Chromium, desktop and Android layouts): 26 passed, including password prompt and retry, Define, All notes search/filter/jump, Anki and annotated-PDF downloads (highlight position checked against the selected words), warm light and schedule, time left, shortcut list, continuous read aloud across pages and both sleep-timer stop modes.
- Annotated PDFs were also checked with Poppler, a separate PDF engine.

Still to check on Windows hardware: Open with and double-click after installing, second-launch hand-off, folder sync against a real OneDrive folder, the update banner once a newer release exists, and the mouse wheel with a physical mouse.
