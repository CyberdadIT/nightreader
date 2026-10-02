// Windows speech through SAPI 5 (COM) (Linux: see speech_linux.rs), driven by the built-in Windows PowerShell host.
//
// System.Speech only sees the old "desktop" voices, which on many Windows 10/11
// installs is a single voice (for example Hazel, female, on UK English systems).
// SAPI's COM interface can also use the newer "OneCore" voices that Windows
// installs per language (George, Hazel and Susan for UK English; David, Mark and
// Zira for US English, and any voices added in Settings → Time & language → Speech).
//
// Document text is piped through stdin, never interpolated into PowerShell code.
// While speaking, the script prints "W <position> <length>" for each word so the
// reader can highlight it; positions are UTF-16 offsets into the text, like JavaScript's.
use serde::Serialize;
use std::process::Child;
use std::sync::{Arc, Mutex};
#[derive(Default, Clone)]
pub struct SpeechState(pub Arc<Mutex<Option<Child>>>);

#[derive(Serialize, Debug, PartialEq)]
pub struct Voice {
    name: String,
    lang: String,
    #[serde(rename = "voiceURI")]
    uri: String,
    #[serde(rename = "localService")]
    local: bool,
    gender: String,
}

#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct WordMark {
    pub pos: u32,
    pub len: u32,
}

#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
const VOICE_ROOTS: [&str; 2] = [
    r"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Speech_OneCore\Voices\Tokens\",
    r"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Speech\Voices\Tokens\",
];

#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
/// A voice id must be one of the installed voice tokens: a registry path under one of
/// the two voice roots, with an ordinary token name. Anything else is refused.
pub fn valid_voice_id(id: &str) -> bool {
    if id.is_empty() {
        return true; // system default voice
    }
    VOICE_ROOTS.iter().any(|root| {
        id.len() <= 300
            && id.starts_with(root)
            && id[root.len()..].chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.' | ' '))
            && !id[root.len()..].is_empty()
    })
}

#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
/// Parse one "W <pos> <len>" progress line from the speech script.
pub fn parse_word_line(line: &str) -> Option<WordMark> {
    let mut parts = line.trim().split(' ');
    if parts.next()? != "W" {
        return None;
    }
    let pos = parts.next()?.parse().ok()?;
    let len = parts.next()?.parse().ok()?;
    Some(WordMark { pos, len })
}

#[cfg(target_os = "windows")]
fn powershell(script: &str) -> std::process::Command {
    use std::os::windows::process::CommandExt;
    // Full path to the in-box Windows PowerShell, so no other powershell.exe on the search path is used.
    let root = std::env::var_os("SystemRoot").map(std::path::PathBuf::from).unwrap_or_else(|| std::path::PathBuf::from(r"C:\Windows"));
    let mut command = std::process::Command::new(root.join(r"System32\WindowsPowerShell\v1.0\powershell.exe"));
    command.creation_flags(0x08000000).args(["-NoProfile", "-NonInteractive", "-Command", script]);
    command
}

#[cfg(target_os = "windows")]
const VOICES_SCRIPT: &str = r#"
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
$out=New-Object System.Collections.ArrayList
$seen=@{}
foreach($cat in @('HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Speech_OneCore\Voices','HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Speech\Voices')){
  try { $c=New-Object -ComObject SAPI.SpObjectTokenCategory; $c.SetId($cat,$false); $tokens=$c.EnumerateTokens() } catch { continue }
  foreach($t in $tokens){
    $name=''; $gender=''; $lang=''
    try { $name=$t.GetAttribute('Name') } catch {}
    try { $gender=$t.GetAttribute('Gender') } catch {}
    try { $lcid=[Convert]::ToInt32(($t.GetAttribute('Language') -split ';')[0],16); $lang=[Globalization.CultureInfo]::GetCultureInfo($lcid).Name } catch {}
    if(-not $name){ $name=$t.GetDescription(0) }
    $key=($name -replace ' Desktop$','') + '|' + $lang
    if($seen.ContainsKey($key)){ continue }
    $seen[$key]=1
    [void]$out.Add(@{id=$t.Id;name=$name;gender=$gender;lang=$lang})
  }
}
ConvertTo-Json -InputObject @($out) -Compress
"#;

#[cfg(target_os = "windows")]
const SPEAK_SCRIPT: &str = r#"
[Console]::InputEncoding=New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
$v=New-Object -ComObject SAPI.SpVoice
if($env:NR_VOICE){ $t=New-Object -ComObject SAPI.SpObjectToken; $t.SetId($env:NR_VOICE); $v.Voice=$t }
$v.Rate=[int]$env:NR_RATE
$text=[Console]::In.ReadToEnd()
# 1 = speak asynchronously, 16 = the text is plain text, not SAPI XML.
[void]$v.Speak($text,17)
$last=-1
while(-not $v.WaitUntilDone(40)){
  $p=$v.Status.InputWordPosition
  if($p -ne $last){ $last=$p; [Console]::Out.WriteLine("W $p $($v.Status.InputWordLength)"); [Console]::Out.Flush() }
}
"#;

#[tauri::command]
#[allow(clippy::needless_return)] // one return per platform block
pub async fn get_speech_voices(lang: Option<String>) -> Result<Vec<Voice>, String> {
    #[cfg(target_os = "windows")]
    {
        let _ = lang;
        let output = tauri::async_runtime::spawn_blocking(|| powershell(VOICES_SCRIPT).output())
            .await
            .map_err(|e| e.to_string())?
            .map_err(|e| e.to_string())?;
        if !output.status.success() {
            return Err("Windows speech voices are unavailable".into());
        }
        return parse_voices(&output.stdout);
    }
    #[cfg(target_os = "linux")]
    {
        let lang = lang.unwrap_or_else(|| "en".into());
        let found = tauri::async_runtime::spawn_blocking(move || crate::speech_linux::voices(&lang)).await.map_err(|e| e.to_string())??;
        return Ok(found.into_iter().map(|v| Voice { name: v.name, lang: v.lang, uri: v.uri, local: v.local, gender: v.gender }).collect());
    }
    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        let _ = lang;
        Err("Native speech isn't available on this system".into())
    }
}

#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
/// Turn the voice script's JSON into voices, keeping only well-formed, valid entries.
pub fn parse_voices(json: &[u8]) -> Result<Vec<Voice>, String> {
    let value: serde_json::Value = serde_json::from_slice(json).map_err(|e| e.to_string())?;
    let items = match value {
        serde_json::Value::Array(items) => items,
        other => vec![other],
    };
    Ok(items
        .into_iter()
        .filter_map(|v| {
            let id = v["id"].as_str()?;
            if !valid_voice_id(id) || id.is_empty() {
                return None;
            }
            let name = v["name"].as_str().unwrap_or("").chars().take(120).collect::<String>();
            let gender = match v["gender"].as_str().unwrap_or("").to_ascii_lowercase().as_str() {
                "male" => "male",
                "female" => "female",
                _ => "",
            };
            Some(Voice {
                name: if name.is_empty() { "Windows voice".into() } else { name },
                lang: v["lang"].as_str().unwrap_or("").chars().take(20).collect(),
                uri: id.into(),
                local: true,
                gender: gender.into(),
            })
        })
        .collect())
}

/// Wait for a speech process, unless another one replaces it or it's stopped.
#[cfg(any(target_os = "windows", target_os = "linux"))]
async fn track(state: &SpeechState, child: std::process::Child, failure: &'static str) -> Result<(), String> {
    let process_id = child.id();
    let shared = state.0.clone();
    {
        let mut slot = shared.lock().map_err(|e| e.to_string())?;
        if let Some(mut old) = slot.take() {
            let _ = old.kill();
            let _ = old.wait();
        }
        *slot = Some(child);
    }
    tauri::async_runtime::spawn_blocking(move || loop {
        {
            let mut slot = shared.lock().map_err(|e| e.to_string())?;
            match slot.as_mut() {
                Some(child) if child.id() == process_id => {
                    if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
                        slot.take();
                        return if status.success() { Ok(()) } else { Err(failure.to_string()) };
                    }
                }
                _ => return Ok(()),
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(40));
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
#[allow(clippy::needless_return)] // one return per platform block
pub async fn speak_text(app: tauri::AppHandle, state: tauri::State<'_, SpeechState>, text: String, rate: f64, voice: String, lang: Option<String>) -> Result<(), String> {
    if text.len() > 4096 {
        return Err("Speech chunk is too long".into());
    }
    #[cfg(target_os = "windows")]
    {
        use std::io::{BufRead, BufReader, Write};
        use std::process::Stdio;
        use tauri::Emitter;
        let _ = lang;
        if !valid_voice_id(&voice) {
            return Err("Unknown voice".into());
        }
        // NightReader's 0.5×–2× maps onto SAPI's −10…10 scale (0 = normal).
        let sapi_rate = ((rate.clamp(0.5, 2.0) - 1.0) * 5.0).round() as i32;
        let mut child = powershell(SPEAK_SCRIPT)
            .env("NR_RATE", sapi_rate.to_string())
            .env("NR_VOICE", &voice)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| e.to_string())?;
        child.stdin.take().ok_or("Speech input is unavailable")?.write_all(text.as_bytes()).map_err(|e| e.to_string())?;
        if let Some(stdout) = child.stdout.take() {
            std::thread::spawn(move || {
                for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                    if let Some(mark) = parse_word_line(&line) {
                        let _ = app.emit("speech-word", mark);
                    }
                }
            });
        }
        return track(state.inner(), child, "Windows speech failed. Try another voice.").await;
    }
    #[cfg(target_os = "linux")]
    {
        use std::io::Write;
        use std::process::Stdio;
        let _ = app;
        if !crate::speech_linux::valid_voice_id(&voice) {
            return Err("Unknown voice".into());
        }
        let lang = lang.unwrap_or_else(|| "en".into());
        let mut command = crate::speech_linux::speak_command(&voice, rate, &lang)
            .ok_or("No text-to-speech engine was found. Install speech-dispatcher or espeak-ng (for example: sudo apt install speech-dispatcher espeak-ng).")?;
        let mut child = command.stdin(Stdio::piped()).stdout(Stdio::null()).stderr(Stdio::null()).spawn().map_err(|e| e.to_string())?;
        {
            // Closing stdin (dropping it) tells the engine the text is complete.
            let mut input = child.stdin.take().ok_or("Speech input is unavailable")?;
            input.write_all(text.as_bytes()).map_err(|e| e.to_string())?;
        }
        return track(state.inner(), child, "Speech failed. Try another voice.").await;
    }
    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        let _ = (app, state, text, rate, voice, lang);
        Err("Native speech isn't available on this system".into())
    }
}

#[tauri::command]
pub fn stop_speech(state: tauri::State<'_, SpeechState>) -> Result<(), String> {
    let mut slot = state.inner().0.lock().map_err(|e| e.to_string())?;
    if let Some(mut child) = slot.take() {
        child.kill().map_err(|e| e.to_string())?;
        let _ = child.wait();
    }
    drop(slot);
    #[cfg(target_os = "linux")]
    crate::speech_linux::cancel();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn voice_ids_must_be_installed_voice_tokens() {
        assert!(valid_voice_id(""));
        assert!(valid_voice_id(r"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Speech_OneCore\Voices\Tokens\MSTTS_V110_enGB_GeorgeM"));
        assert!(valid_voice_id(r"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Speech\Voices\Tokens\TTS_MS_EN-GB_HAZEL_11.0"));
        assert!(!valid_voice_id(r"HKEY_CURRENT_USER\Software\Evil\Tokens\X"));
        assert!(!valid_voice_id(r"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Speech\Voices\Tokens\..\..\Run"));
        assert!(!valid_voice_id(r"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Speech\Voices\Tokens\"));
        assert!(!valid_voice_id("Microsoft Hazel Desktop; Remove-Item C:\\"));
    }
    #[test]
    fn word_progress_lines() {
        assert_eq!(parse_word_line("W 12 5\r\n"), Some(WordMark { pos: 12, len: 5 }));
        assert_eq!(parse_word_line("hello"), None);
        assert_eq!(parse_word_line("W x 5"), None);
    }
    #[test]
    fn voices_from_script_output() {
        let json = br#"[{"id":"HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Speech_OneCore\\Voices\\Tokens\\MSTTS_V110_enGB_GeorgeM","name":"Microsoft George","gender":"Male","lang":"en-GB"},{"id":"bad","name":"X"}]"#;
        let voices = parse_voices(json).unwrap();
        assert_eq!(voices.len(), 1);
        assert_eq!(voices[0].gender, "male");
        assert_eq!(voices[0].lang, "en-GB");
        let single = br#"{"id":"HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Speech\\Voices\\Tokens\\TTS_MS_EN-GB_HAZEL_11.0","name":"Microsoft Hazel Desktop","gender":"Female","lang":"en-GB"}"#;
        assert_eq!(parse_voices(single).unwrap()[0].gender, "female");
    }
}
