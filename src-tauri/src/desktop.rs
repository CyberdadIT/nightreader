//! Desktop integration: documents opened from Windows Explorer ("Open with",
//! double-click, drag onto the app icon) and the folder used for sync.
//!
//! Only files the operating system handed to NightReader can be read here.
//! The web view never gets general file-system access through these commands.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::ipc::Response;
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Default)]
pub struct OpenedFiles {
    /// Paths waiting for the web view to pick them up.
    pending: Mutex<Vec<String>>,
    /// Paths the web view may read once. Filled only from command-line arguments.
    allowed: Mutex<HashSet<PathBuf>>,
}

fn is_document(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_ascii_lowercase())
            .as_deref(),
        Some("pdf") | Some("epub")
    )
}

/// PDF and EPUB files named on a command line, resolved against its working directory.
pub fn document_paths<I: IntoIterator<Item = String>>(args: I, cwd: &Path) -> Vec<PathBuf> {
    args.into_iter()
        .filter(|a| !a.starts_with('-'))
        .map(|a| {
            let p = PathBuf::from(a);
            if p.is_absolute() { p } else { cwd.join(p) }
        })
        .filter(|p| is_document(p) && p.is_file())
        .filter_map(|p| p.canonicalize().ok())
        .collect()
}

impl OpenedFiles {
    pub fn from_startup() -> Self {
        let files = Self::default();
        let cwd = std::env::current_dir().unwrap_or_default();
        files.add(document_paths(std::env::args().skip(1), &cwd));
        files
    }

    fn add(&self, paths: Vec<PathBuf>) -> bool {
        if paths.is_empty() {
            return false;
        }
        let mut allowed = self.allowed.lock().unwrap();
        let mut pending = self.pending.lock().unwrap();
        for p in paths {
            let text = p.to_string_lossy().into_owned();
            if !pending.contains(&text) {
                pending.push(text);
            }
            allowed.insert(p);
        }
        true
    }
}

/// Called when the user opens a document while NightReader is already running.
#[cfg(desktop)]
pub fn second_instance(app: &AppHandle, argv: Vec<String>, cwd: String) {
    let paths = document_paths(argv.into_iter().skip(1), Path::new(&cwd));
    if app.state::<OpenedFiles>().add(paths) {
        let _ = app.emit("open-files-pending", ());
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[tauri::command]
pub fn take_opened_files(files: State<'_, OpenedFiles>) -> Vec<String> {
    std::mem::take(&mut *files.pending.lock().unwrap())
}

#[tauri::command]
pub fn read_opened_file(files: State<'_, OpenedFiles>, path: String) -> Result<Response, String> {
    let path = PathBuf::from(path);
    if !files.allowed.lock().unwrap().remove(&path) {
        return Err("NightReader can only open files you choose.".into());
    }
    std::fs::read(&path)
        .map(Response::new)
        .map_err(|e| format!("Could not read {}: {e}", path.display()))
}

const SYNC_DIR: &str = "NightReader";
const SYNC_FILE: &str = "nightreader-sync.json";
const SYNC_MAX_BYTES: usize = 20 * 1024 * 1024;

/// The sync file always lives at <chosen folder>/NightReader/nightreader-sync.json.
fn sync_path(folder: &str) -> Result<PathBuf, String> {
    let base = PathBuf::from(folder);
    if !base.is_absolute() {
        return Err("Choose a sync folder first.".into());
    }
    if !base.is_dir() {
        return Err("The sync folder is not available. Check the drive or cloud folder is connected.".into());
    }
    Ok(base.join(SYNC_DIR).join(SYNC_FILE))
}

#[tauri::command]
pub fn sync_read(folder: String) -> Result<Option<String>, String> {
    let path = sync_path(&folder)?;
    match std::fs::read_to_string(&path) {
        Ok(text) => Ok(Some(text)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("Could not read the sync file: {e}")),
    }
}

#[tauri::command]
pub fn sync_write(folder: String, contents: String) -> Result<(), String> {
    if contents.len() > SYNC_MAX_BYTES {
        return Err("Sync data is unexpectedly large; not written.".into());
    }
    let path = sync_path(&folder)?;
    std::fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    // Write then rename, so cloud clients never pick up a half-written file.
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, contents).map_err(|e| format!("Could not write the sync file: {e}"))?;
    std::fs::rename(&tmp, &path).map_err(|e| format!("Could not replace the sync file: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn picks_only_existing_documents() {
        let dir = std::env::temp_dir().join("nr-desktop-test");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("book.PDF"), b"%PDF").unwrap();
        std::fs::write(dir.join("notes.txt"), b"x").unwrap();
        let found = document_paths(
            ["book.PDF", "notes.txt", "missing.epub", "--flag"].map(String::from),
            &dir,
        );
        assert_eq!(found.len(), 1);
        assert!(found[0].ends_with("book.PDF"));
    }

    #[test]
    fn opened_files_can_be_read_once() {
        let files = OpenedFiles::default();
        let p = std::env::temp_dir().join("nr-once.pdf");
        std::fs::write(&p, b"%PDF").unwrap();
        files.add(vec![p.clone()]);
        assert!(files.allowed.lock().unwrap().remove(&p));
        assert!(!files.allowed.lock().unwrap().contains(&p));
    }

    #[test]
    fn sync_path_rejects_relative_and_missing_folders() {
        assert!(sync_path("relative/dir").is_err());
        assert!(sync_path("/definitely/not/here/nr").is_err());
        let ok = sync_path(std::env::temp_dir().to_str().unwrap()).unwrap();
        assert!(ok.ends_with("NightReader/nightreader-sync.json"));
    }
}
