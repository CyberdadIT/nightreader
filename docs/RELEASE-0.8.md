# NightReader 0.8: pen, read along, study and privacy

This release adds seven features: Surface Pen ink, read-along highlighting with more voices, side-by-side reading, library-wide search, flashcard review, reading statistics, and an app lock with encrypted storage. It builds on 0.7 (pull request #6).

## Surface Pen and ink (PDF)

- **No tool needed for the pen.** While a pen hovers over the screen, the page takes ink from it. Fingers still scroll, turn pages and pinch. When the pen moves away, everything works as before (mouse text selection, links, forms).
- **Pressure** changes the stroke width. The **eraser end** of a Surface Pen removes any stroke it touches. **Ctrl+Z** undoes the last stroke or erase (up to 200 steps per session).
- **✒ Ink** in the toolbar turns on drawing with a mouse. It has five colours (yellow is a translucent highlighter), three thicknesses, an eraser and undo. While it's on, one finger pans the page instead of drawing.
- **Storage.** Strokes are stored in PDF page coordinates, so they stay in place at any zoom or rotation. They are saved with your notes, sync, go into backups, and appear as a count in ☰ Notes.
- **Annotated PDF copies.** *Save annotated PDF copy* writes strokes as standard `/Ink` annotations with their own appearance, so Acrobat, Edge and other readers show them.
- **Limits.**
  - Ink works on PDFs only. EPUB text reflows, so a drawing wouldn't stay next to the words it was drawn on.
  - In tests the pen was driven through Chromium's pen input. The eraser end can't be emulated there, so it was tested with the eraser tool. Please try the eraser end on your Surface.

## Read along and voices

- **Highlighting.** Read aloud highlights the sentence being read (light blue) and the current word (yellow), and scrolls to keep them in view. This works on Windows, in Chromium/WebView2, Safari, Android and iOS, wherever the speech engine reports word positions. Turn it off with *Follow along*.
- **Why you only heard a female voice.** On Windows, NightReader used .NET's System.Speech, which can only see the older "desktop" voices. On many UK English systems that is a single voice: Hazel, who is female.
  - 0.8 talks to SAPI directly and also lists the newer "OneCore" voices that Windows installs for each language. For UK English that adds George (male) and Susan. If US English is installed you also get David and Mark (male) and Zira.
  - The menu shows each voice's language and gender, and ▶ Preview plays a sample.
  - To get more voices, go to Windows Settings → Time & language → Speech → *Add voices*. They appear in NightReader after a restart.
  - Voice IDs are checked against the two Windows voice registry locations before use. Text is still sent to PowerShell through stdin, and now also as plain text rather than SAPI XML.
- **Phones** list every voice the system's text-to-speech engine offers. Google's voices on Android don't report gender, so gender is shown only for recognised voice names.

## Side by side

- **◫ Side by side** splits the reading area into two panes. Each pane shows a document (choose it from the pane's menu) at its own page. The same document can be in both panes, for example a figure on one side and the text discussing it on the other.
- **Active pane.** Clicking or tapping a pane makes it active, marked by a blue line. The toolbar, keyboard, ☰ Notes, search and read aloud then work on that pane. Opening another tab replaces the active pane only.
- **Narrow screens.** On screens under 760 px wide, the panes stack.

## Search every document

- **Where to find it.** Library → *Search text* searches the text of every document in the library: PDF text, OCR text for scanned pages, and EPUB chapters.
  - Case and accents don't matter.
  - Results are grouped by document, with snippets and match counts.
  - Opening a result goes to that page with the matches highlighted.
- **The index.** Each document's text is extracted once, the first time you search, and kept on the device. After that, searches are offline and immediate.
  - Removing a document deletes its index entry.
  - Running OCR deletes it too, so the new text is indexed next time.
- **Password-protected PDFs** are never indexed, so their text stays out of storage.

## Flashcard review

- **Cards.** Library → *Review flashcards*. Every highlight that has a note is a card: the passage on the front, your note on the back.
  - Space shows the answer. Keys 1–4 (Again, Hard, Good, Easy) grade it, and each button shows when the card will come back.
  - Each session reviews every due card plus up to 20 new ones, optionally from one document only.
- **Scheduling.** Scheduling follows the SM-2 family that Anki uses.
  - *Again* brings the card back in 10 minutes and lowers its ease.
  - *Good* gives gaps of 1 day, 4 days, then about 2.5× each time.
  - *Easy* stretches the gaps further.
- **Storage.** Progress is kept on the device and in backups. The Anki export from 0.6 is still there.

## Reading statistics

- **What 📊 shows:**
  - today, this week, your streak (days in a row with at least a minute of reading), and all time
  - a 30-day chart of minutes per day: hover or focus a bar for its numbers; a screen reader gets a table instead
  - time, pages and progress for each document, with finished documents marked
- **What counts.** Only active reading counts, in 15-second steps: the window is in front, a document is on screen, and there was a page turn, scroll, key or tap in the last two minutes. Read aloud also counts. Moving forward one page (or two in two-page view) counts as pages read; jumps don't.
- **Storage.** Statistics stay on the device and are included in backups. A restore keeps the higher figure for each day, so nothing is counted twice.

## App lock and encrypted storage

- **Turning it on.** Settings → *App lock* → *Turn on app lock…*, then choose a passphrase of 8 or more characters. NightReader then asks for the passphrase when it starts. It also locks after the time you choose without use (1, 5, 15 or 60 minutes) or after being in the background that long, and 🔒 in the top bar locks it at once. Locking reloads the app, so no decrypted documents or notes stay in memory.
- **What's encrypted.** Everything NightReader stores on the device: the library, notes, bookmarks, settings and statistics (localStorage), and documents, OCR text, note snapshots and the search index (IndexedDB). OCR language packs aren't encrypted; they're public data.
- **How it works.**
  - A random 256-bit data key encrypts each record with AES-256-GCM, with a fresh 96-bit IV every time.
  - The data key is wrapped with a key derived from your passphrase: PBKDF2-SHA-256, 600,000 iterations (OWASP's current recommendation), 16-byte random salt.
  - Only the wrapped key and the salt are stored. Unlocking derives the key in memory as a non-extractable WebCrypto key.
  - Changing the passphrase re-wraps the key without re-encrypting everything.
- **Safe to interrupt.** The lock record is saved before data is converted. If the app closes part-way, the next start finishes the job, and nothing becomes unreadable.
- **Forgotten passphrase.** The lock screen offers *Forgot the passphrase?*, which deletes NightReader's data on the device so you can start again (type DELETE to confirm). There's no recovery without the passphrase; that is what keeps the data safe. Keep a backup.
- **Password-protected backups.**
  - When you save a backup, *Protect the backup with a password* encrypts it with AES-256-GCM and its own PBKDF2-derived key. The file is `.nrbackup`.
  - The header records the iteration count and is authenticated.
  - Restore asks for the password.

**What the lock does not cover:**
- **The sync file.** It is plain JSON in the folder you chose (for example OneDrive), so keep that folder private.
- **Unprotected backups.**
- **Error log.** While the lock is on it's kept in memory only, and turning the lock on clears the stored one.
- **Leftover copies.** Old unencrypted copies of data may stay in the browser engine's storage files until it compacts them.
- **Windows Hello and fingerprint unlock** aren't available yet.

## Security review of this release

An independent review of the lock and encryption code before release found these issues, all fixed and covered by tests:
- Saving a large library failed silently with the lock on (base64 of a large buffer overflowed the call stack).
- Retrying a failed "turn on" could replace the data key and strand records already encrypted.
- A write racing an auto-lock could store plaintext.
- Turning the lock off could miss records written during the conversion.
- Finishing an interrupted conversion could restore an older lock record.

## Toolbar

Less-used view options (reset zoom, rotate, two pages, continuous scroll, invert colours, focus mode, print, open document) are in a **More ▾** menu that works with the keyboard (arrow keys, Home, End, Escape). The toolbar now fits on one row at 1368 × 912, the Surface Pro 4's default scaled size, even with the ink options open.

## Validation recorded

- **Unit tests:** 92 passed. New:
  - read-along alignment
  - voice labels
  - ink cleaning, geometry and sync validation
  - flashcard scheduling
  - statistics, including streaks and backup merging
  - library search with accents
  - the app lock: wrong passphrase, passphrase change, sealing with fresh IVs, tamper detection, no writes while locked, large state, encrypted backups, truncated backups
- **Rust tests:** 8 passed. New: voice ID allowlist, word-progress parsing, voice list parsing.
- **Browser tests** (Chromium, desktop and Android layouts, production build under CSP): 83 passed, 7 skipped (pen, mouse ink and side by side on the phone layout). New:
  - pen writing, erasing, undo and the `/Ink` export
  - mouse ink
  - read along with male and female voices, and preview
  - library search
  - side by side
  - app lock: encrypt, wrong passphrase, unlock, lock now, auto-lock, turn off, reset
  - password-protected backups
  - flashcards
  - statistics
  - accessibility audits of every new screen
- `npm audit`: 0 vulnerabilities. `cargo audit`: 0 vulnerabilities.

Still to check on your Surface:
- the Windows voice list (male voices) and word highlighting with SAPI
- the Surface Pen's eraser end and palm resting while writing
- the app lock across a real restart of the installed app
