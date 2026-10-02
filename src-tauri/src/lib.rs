mod desktop;
mod security;
mod speech;

pub fn run() {
    let builder = tauri::Builder::default();
    // Must be the first plugin: a second launch hands its files to this window and exits.
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
        desktop::second_instance(app, argv, cwd)
    }));
    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(security::navigation_guard())
        .manage(speech::SpeechState::default())
        .manage(desktop::OpenedFiles::from_startup())
        .invoke_handler(tauri::generate_handler![
            speech::get_speech_voices,
            speech::speak_text,
            speech::stop_speech,
            desktop::take_opened_files,
            desktop::read_opened_file,
            desktop::sync_read,
            desktop::sync_write,
            security::open_external_link
        ])
        .run(tauri::generate_context!())
        .expect("error while running NightReader");
}
