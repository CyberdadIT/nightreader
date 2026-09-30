// Windows SAPI through the built-in Windows PowerShell host. Document text is
// piped through stdin, never interpolated into executable PowerShell code.
use std::sync::{Arc, Mutex};
use std::process::Child;
use serde::Serialize;
#[derive(Default, Clone)]
pub struct SpeechState(pub Arc<Mutex<Option<Child>>>);
#[derive(Serialize)]
pub struct Voice { name: String, lang: String, #[serde(rename="voiceURI")] uri: String, #[serde(rename="localService")] local: bool }
#[cfg(target_os="windows")]
fn powershell(script: &str) -> std::process::Command {
    use std::os::windows::process::CommandExt;
    let mut command=std::process::Command::new("powershell.exe");
    command.creation_flags(0x08000000).args(["-NoProfile","-NonInteractive","-Command",script]);
    command
}
#[tauri::command]
pub async fn get_speech_voices() -> Result<Vec<Voice>,String> {
    #[cfg(target_os="windows")]
    {
        let output=tauri::async_runtime::spawn_blocking(|| powershell("[Console]::InputEncoding=New-Object System.Text.UTF8Encoding($false); [Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false); Add-Type -AssemblyName System.Speech; $s=New-Object System.Speech.Synthesis.SpeechSynthesizer; @($s.GetInstalledVoices() | ForEach-Object { @{name=$_.VoiceInfo.Name;lang=$_.VoiceInfo.Culture.Name} }) | ConvertTo-Json -Compress; $s.Dispose()").output()).await.map_err(|e|e.to_string())?.map_err(|e|e.to_string())?;
        if !output.status.success(){return Err("Windows speech voices are unavailable".into());}
        let value:serde_json::Value=serde_json::from_slice(&output.stdout).map_err(|e|e.to_string())?;
        let items=if value.is_array(){value.as_array().unwrap().clone()}else{vec![value]};
        return Ok(items.into_iter().filter_map(|v|Some(Voice{name:v["name"].as_str()?.into(),lang:v["lang"].as_str()?.into(),uri:v["name"].as_str()?.into(),local:true})).collect());
    }
    #[cfg(not(target_os="windows"))]
    Err("Native speech is currently supported on Windows only".into())
}
#[tauri::command]
pub async fn speak_text(state:tauri::State<'_,SpeechState>,text:String,rate:f64,voice:String)->Result<(),String> {
    #[cfg(target_os="windows")]
    {
        use std::io::Write;
        use std::process::Stdio;
        if text.len()>4096{return Err("Speech chunk is too long".into());}
        let script="[Console]::InputEncoding=New-Object System.Text.UTF8Encoding($false); [Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false); Add-Type -AssemblyName System.Speech; $s=New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.Rate=[int]$env:NR_RATE; if($env:NR_VOICE){$s.SelectVoice($env:NR_VOICE)}; $s.Speak([Console]::In.ReadToEnd()); $s.Dispose()";
        let mut child=powershell(script).env("NR_RATE",(((rate.clamp(0.5,2.0)-1.0)*5.0).round() as i32).to_string()).env("NR_VOICE",voice).stdin(Stdio::piped()).stdout(Stdio::null()).stderr(Stdio::null()).spawn().map_err(|e|e.to_string())?;
        let process_id=child.id();
        child.stdin.take().ok_or("Speech input is unavailable")?.write_all(text.as_bytes()).map_err(|e|e.to_string())?;
        let shared=state.inner().0.clone();
        {
            let mut slot=shared.lock().map_err(|e|e.to_string())?;
            if let Some(mut old)=slot.take(){let _=old.kill();let _=old.wait();}
            *slot=Some(child);
        }
        return tauri::async_runtime::spawn_blocking(move || {
            loop {
                {
                    let mut slot=shared.lock().map_err(|e|e.to_string())?;
                    match slot.as_mut(){
                        Some(child) if child.id()==process_id => {
                            if let Some(status)=child.try_wait().map_err(|e|e.to_string())?{
                                slot.take();return if status.success(){Ok(())}else{Err("Windows speech failed".into())};
                            }
                        },
                        _ => return Ok(()),
                    }
                }
                std::thread::sleep(std::time::Duration::from_millis(50));
            }
        }).await.map_err(|e|e.to_string())?;
    }
    #[cfg(not(target_os="windows"))]
    { let _=(state,text,rate,voice); Err("Native speech is currently supported on Windows only".into()) }
}
#[tauri::command]
pub fn stop_speech(state:tauri::State<'_,SpeechState>)->Result<(),String> {
    let mut slot=state.inner().0.lock().map_err(|e|e.to_string())?;
    if let Some(mut child)=slot.take(){child.kill().map_err(|e|e.to_string())?;let _=child.wait();}
    Ok(())
}
