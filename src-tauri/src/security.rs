//! Window-level safety nets:
//! - the reader window can only ever show NightReader itself (navigation allowlist);
//! - web links found in documents open in the browser only after the user confirms
//!   in a native dialog that page script cannot click for them.

use tauri::plugin::{Builder, TauriPlugin};
use tauri::{AppHandle, Runtime, Url};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_opener::OpenerExt;

/// Pages the window may navigate to: the bundled app, plus the Vite dev server in development.
pub fn is_allowed_navigation(url: &Url, dev: bool) -> bool {
    match url.scheme() {
        "tauri" => true,
        "http" | "https" => match url.host_str() {
            Some("tauri.localhost") => true,
            Some("localhost") | Some("127.0.0.1") => dev && url.port() == Some(1420),
            _ => false,
        },
        _ => false,
    }
}

pub fn navigation_guard<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("navigation-guard")
        .on_navigation(|_webview, url| is_allowed_navigation(url, cfg!(dev)))
        .build()
}

/// Checks a link from a document and returns the text to show in the confirmation.
pub fn describe_external_link(raw: &str) -> Result<(Url, String), String> {
    if raw.len() > 2048 {
        return Err("That link is too long to open safely.".into());
    }
    let url = Url::parse(raw).map_err(|_| "That link isn't a valid web address.".to_string())?;
    match url.scheme() {
        "http" | "https" => {
            // The host is shown on its own line, in punycode, so look-alike names and
            // tricks such as https://bank.example@evil.example are visible.
            let host = url.host_str().ok_or("That link has no website address.")?;
            Ok((url.clone(), format!("Open this link in your browser?\n\nSite: {host}\n\n{}", url.as_str())))
        }
        "mailto" => Ok((url.clone(), format!("Open your email app for this address?\n\n{}", url.path()))),
        other => Err(format!("NightReader doesn't open {other}: links.")),
    }
}

/// Opens a document's web link after the user confirms. Returns false if they cancel.
#[tauri::command]
pub async fn open_external_link<R: Runtime>(app: AppHandle<R>, url: String) -> Result<bool, String> {
    let (url, message) = describe_external_link(&url)?;
    let dialog_app = app.clone();
    let confirmed = tauri::async_runtime::spawn_blocking(move || {
        dialog_app
            .dialog()
            .message(message)
            .title("Open link")
            .kind(MessageDialogKind::Warning)
            .buttons(MessageDialogButtons::OkCancelCustom("Open".into(), "Cancel".into()))
            .blocking_show()
    })
    .await
    .map_err(|e| e.to_string())?;
    if confirmed {
        app.opener().open_url(url.as_str(), None::<&str>).map_err(|e| e.to_string())?;
    }
    Ok(confirmed)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn nav(u: &str, dev: bool) -> bool {
        is_allowed_navigation(&Url::parse(u).unwrap(), dev)
    }

    #[test]
    fn only_the_app_itself_can_load_in_the_window() {
        assert!(nav("tauri://localhost/index.html", false));
        assert!(nav("http://tauri.localhost/index.html", false));
        assert!(nav("https://tauri.localhost/", false));
        assert!(!nav("https://evil.example/", false));
        assert!(!nav("http://tauri.localhost.evil.example/", false));
        assert!(!nav("file:///C:/Windows/System32/", false));
        assert!(!nav("javascript:alert(1)", false));
        assert!(!nav("http://localhost:1420/", false), "dev server only in development");
        assert!(nav("http://localhost:1420/", true));
        assert!(!nav("http://localhost:8080/", true));
    }

    #[test]
    fn external_links_are_checked_and_described() {
        let (_, text) = describe_external_link("https://bank.example@evil.example/login").unwrap();
        assert!(text.contains("Site: evil.example"));
        let (_, text) = describe_external_link("https://xn--pple-43d.com/").unwrap();
        assert!(text.contains("xn--pple-43d.com"), "look-alike domains stay in punycode");
        assert!(describe_external_link("mailto:someone@example.com").is_ok());
        assert!(describe_external_link("javascript:alert(1)").is_err());
        assert!(describe_external_link("file:///C:/Windows/").is_err());
        assert!(describe_external_link("ms-settings:privacy").is_err());
        assert!(describe_external_link(&format!("https://example.com/{}", "a".repeat(3000))).is_err());
        assert!(describe_external_link("not a url").is_err());
    }
}
