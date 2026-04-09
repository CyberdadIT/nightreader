# Contributing to NightReader

Thank you for your interest in contributing! This guide will help you get started.

## Development setup

```bash
git clone https://github.com/your-org/nightreader.git
cd nightreader
npm install
npm run dev          # browser dev server at localhost:1420
npm run tauri:dev    # desktop app with hot reload
```

## Before you submit a PR

1. **Open an issue first** for anything non-trivial so we can discuss the approach.
2. **Fork the repo** and create a branch from `main`.
3. **Write clear commit messages** using [Conventional Commits](https://www.conventionalcommits.org/).
4. **Test on at least one platform** before submitting.
5. **Update CHANGELOG.md** under `[Unreleased]` for user-visible changes.

## Commit message format

```
feat: add TTS (text-to-speech) reading mode
fix: correct page count when PDF uses non-standard /Pages dict
docs: add section on iOS sideloading to README
chore: bump pdfjs-dist to 4.5.0
```

## Code style

- All source files use **ES modules** (`import`/`export`).
- Components use **CSS Modules** (`.module.css` next to the `.jsx` file).
- State lives in **Zustand** — avoid local state for anything that should persist.
- Utility functions go in `src/utils/`.
- Platform-specific code is isolated in `src/utils/platform.js`.

## Adding a new feature

1. Add the state slice in `src/store/useStore.js` if needed.
2. Create your component in `src/components/`.
3. Wire it into `App.jsx`.
4. For Tauri-only features, add your Rust command in `src-tauri/src/lib.rs`.
5. For Capacitor-only features, use a Capacitor plugin and guard with `isCapacitor()`.

## Reporting bugs

Please include:
- Platform (Windows / Linux / macOS / Android / iOS) and version
- NightReader version
- Steps to reproduce
- Expected vs actual behaviour
- A PDF that reproduces the issue (if applicable — attach a small test file)

## Licence

By contributing you agree that your contributions will be licensed under the GPL v3.
