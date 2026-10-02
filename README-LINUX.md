# NightReader on Linux

NightReader runs on 64-bit Linux desktops with glibc 2.39 or newer. That means Ubuntu 24.04 or later, Debian 13 or later, Fedora 40 or later, Linux Mint 22 or later, or another current distribution. Each release has three downloads; pick the one that matches your system.

| Download | For | Install |
|---|---|---|
| `NightReader_<version>_amd64.deb` | Ubuntu, Debian, Mint, Pop!_OS | `sudo apt install ./NightReader_<version>_amd64.deb` |
| `NightReader-<version>-1.x86_64.rpm` | Fedora, openSUSE | `sudo dnf install ./NightReader-<version>-1.x86_64.rpm` |
| `NightReader_<version>_amd64.AppImage` | most other distributions, no install needed | `chmod +x NightReader_*.AppImage && ./NightReader_*.AppImage` |

Use `apt install ./file.deb` rather than `dpkg -i`. apt also installs the libraries it needs (WebKitGTK) and the recommended speech packages.

`SHA256SUMS-linux.txt` lists the checksums. Check a download with `sha256sum -c SHA256SUMS-linux.txt --ignore-missing`.

## What's the same as Windows

Everything in the reader works the same way:
- PDFs and EPUBs, highlights and notes, ink, search and flashcards
- the app lock and its encryption
- sync through a folder, backups, OCR, and the update notice

The .deb and .rpm register NightReader for PDF and EPUB files. It then appears under *Open With* in your file manager, and opening a second file while it's running adds it as a tab.

## Read aloud

NightReader uses your system's text-to-speech. Both packages *recommend* these two, so `apt` and `dnf` normally install them for you:
- **speech-dispatcher** (`spd-say`), installed on most desktops
- **eSpeak NG**, which speech-dispatcher normally uses for its voices

If read aloud says no engine was found, install them yourself:
- Ubuntu/Debian: `sudo apt install speech-dispatcher espeak-ng`
- Fedora: `sudo dnf install speech-dispatcher espeak-ng`

The voice menu lists:
- "Male voice" and "Female voice": speech-dispatcher's generic voices, in your language
- the voices of every installed language
- the named male and female variants for your language

For more natural voices, install a better speech-dispatcher module, such as Piper (`speech-dispatcher-piper` on some distributions) or RHVoice.

Linux speech engines don't report which word they're on. Read along therefore highlights the sentence being read, but not each word.

## If something goes wrong

- **The AppImage doesn't start ("dlopen(): error loading libfuse.so.2"):** install FUSE 2. On Ubuntu 24.04 that's `sudo apt install libfuse2t64`. Or run it with `./NightReader_*.AppImage --appimage-extract-and-run`.
- **Blank or flickering window (often NVIDIA, or some Wayland setups):** start it with `WEBKIT_DISABLE_DMABUF_RENDERER=1 nightreader`. You can add that variable to the launcher if it helps.
- **"Open With" doesn't list NightReader after installing:** log out and back in, or run `update-desktop-database ~/.local/share/applications`.
- **Where is my data?** In `~/.local/share/com.nightreader.reader/`. Use Settings → Backup to move it to another computer.

## Security notes

- Packages are built on GitHub's Ubuntu 24.04 runners from the tagged source, without build caches. Every release includes SHA-256 checksums.
- The packages aren't signed with a GPG key yet.
- On Linux, the app's window uses WebKitGTK. Your distribution keeps it updated, so install system updates.
- `cargo audit` reports one "unsound" warning (RUSTSEC-2024-0429) in `glib` 0.18. That library comes from Tauri's GTK bindings. It affects a function NightReader doesn't call, and it will go away when Tauri moves to newer bindings.
