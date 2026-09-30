mod speech;
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(speech::SpeechState::default())
        .invoke_handler(tauri::generate_handler![speech::get_speech_voices, speech::speak_text, speech::stop_speech])
        .run(tauri::generate_context!())
        .expect("error while running NightReader");
}
