#![cfg_attr(not(target_os = "linux"), allow(dead_code))]
// Linux speech, through the system's own text-to-speech:
// - speech-dispatcher (spd-say), installed on most desktops (GNOME, KDE, Ubuntu, Fedora).
//   It talks to whichever synthesiser the user has (eSpeak NG by default, or Piper,
//   RHVoice, Festival...). Its generic "male"/"female" voice types work with any of them.
// - eSpeak NG directly, when speech-dispatcher isn't installed.
//
// Text goes in through stdin and every other value is a separate argument (no shell),
// and voice ids are checked before use. Voices don't report word positions, so read
// along highlights the sentence being read on Linux, not each word.
use serde::Serialize;
use std::collections::HashMap;

#[derive(Serialize, Debug, PartialEq, Clone)]
pub struct LinuxVoice {
    pub name: String,
    pub lang: String,
    #[serde(rename = "voiceURI")]
    pub uri: String,
    #[serde(rename = "localService")]
    pub local: bool,
    pub gender: String,
}

fn voice(name: impl Into<String>, lang: &str, uri: String, gender: &str) -> LinuxVoice {
    LinuxVoice { name: name.into(), lang: lang.to_string(), uri, local: true, gender: gender.to_string() }
}

/// A language tag such as "en", "en-GB" or "pt-br".
pub fn valid_lang(lang: &str) -> bool {
    let mut parts = lang.split('-');
    let first = parts.next().unwrap_or("");
    (2..=3).contains(&first.len())
        && first.chars().all(|c| c.is_ascii_alphabetic())
        && parts.all(|p| (2..=8).contains(&p.len()) && p.chars().all(|c| c.is_ascii_alphanumeric()))
}

/// Primary language subtag, lower case ("en-GB" → "en").
fn base(lang: &str) -> String {
    lang.split(['-', '_']).next().unwrap_or("").to_ascii_lowercase()
}

/// Voice ids NightReader hands out on Linux:
/// "spd-type:male1".."spd-type:female3", "spd:<synthesis voice name>", "espeak:<voice file>[+<variant>]".
pub fn valid_voice_id(id: &str) -> bool {
    if id.is_empty() {
        return true;
    }
    if let Some(t) = id.strip_prefix("spd-type:") {
        return matches!(t, "male1" | "male2" | "male3" | "female1" | "female2" | "female3");
    }
    if let Some(name) = id.strip_prefix("spd:") {
        return !name.is_empty() && name.len() <= 120 && !name.starts_with('-') && name.chars().all(|c| !c.is_control());
    }
    if let Some(file) = id.strip_prefix("espeak:") {
        return !file.is_empty()
            && file.len() <= 80
            && !file.starts_with('-')
            && !file.contains("..")
            && file.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '/' | '-' | '_' | '+' | '!' | '.'));
    }
    false
}

/// Gender of eSpeak NG's variants ("Alicia" → female), from `espeak-ng --voices=variant`.
pub fn parse_variant_genders(listing: &str) -> HashMap<String, String> {
    let mut out = HashMap::new();
    for line in listing.lines().skip(1) {
        let cols: Vec<&str> = line.split_whitespace().collect();
        if cols.len() >= 5 && cols[1] == "variant" {
            let gender = gender_of(cols[2]);
            out.insert(cols[3].to_ascii_lowercase(), gender.to_string());
        }
    }
    out
}

fn gender_of(age_gender: &str) -> &'static str {
    match age_gender.rsplit('/').next() {
        Some("M") => "male",
        Some("F") => "female",
        _ => "",
    }
}

/// `spd-say -L`: columns NAME, LANGUAGE, VARIANT, right-aligned and padded with spaces
/// (names can contain single spaces). Keeps every base voice, plus the named variants
/// of the best match for the reader's language, so the menu stays a sensible length.
pub fn parse_spd_voices(listing: &str, lang: &str, genders: &HashMap<String, String>) -> Vec<LinuxVoice> {
    let mut rows = Vec::new();
    for line in listing.lines().skip(1) {
        let cols: Vec<&str> = line.trim().split("  ").map(str::trim).filter(|c| !c.is_empty()).collect();
        if cols.len() != 3 {
            continue;
        }
        rows.push((cols[0].to_string(), cols[1].to_string(), cols[2].to_string()));
    }
    let wanted = lang.to_ascii_lowercase();
    let best = rows.iter().find(|r| r.1.to_ascii_lowercase() == wanted)
        .or_else(|| rows.iter().find(|r| base(&r.1) == base(&wanted)))
        .map(|r| r.1.clone());
    let mut out = vec![
        voice("Male voice 1", lang, "spd-type:male1".into(), "male"),
        voice("Male voice 2", lang, "spd-type:male2".into(), "male"),
        voice("Female voice 1", lang, "spd-type:female1".into(), "female"),
        voice("Female voice 2", lang, "spd-type:female2".into(), "female"),
    ];
    for (name, vlang, variant) in rows {
        let is_base = variant == "none";
        if !is_base && Some(&vlang) != best.as_ref() {
            continue;
        }
        let uri = format!("spd:{name}");
        if !valid_voice_id(&uri) {
            continue;
        }
        let gender = if is_base { "" } else { genders.get(&variant.to_ascii_lowercase()).map(String::as_str).unwrap_or("") };
        out.push(voice(name, &vlang, uri, gender));
    }
    out
}

/// `espeak-ng --voices`: Pty, Language, Age/Gender, VoiceName, File, Other languages.
/// Base voices for every language, plus each named variant on the reader's language.
pub fn parse_espeak_voices(listing: &str, variants: &str, lang: &str) -> Vec<LinuxVoice> {
    let mut out = Vec::new();
    let wanted = lang.to_ascii_lowercase();
    // (voice file, display name) of the best match for the reader's language.
    let mut exact_match: Option<(String, String)> = None;
    let mut prefix_match: Option<(String, String)> = None;
    for line in listing.lines().skip(1) {
        let cols: Vec<&str> = line.split_whitespace().collect();
        if cols.len() < 5 || cols[1] == "variant" {
            continue;
        }
        let (vlang, gender, name, file) = (cols[1], gender_of(cols[2]), cols[3].replace('_', " "), cols[4]);
        let uri = format!("espeak:{file}");
        if !valid_voice_id(&uri) {
            continue;
        }
        if exact_match.is_none() && vlang.to_ascii_lowercase() == wanted {
            exact_match = Some((file.to_string(), name.clone()));
        } else if prefix_match.is_none() && base(vlang) == base(&wanted) {
            prefix_match = Some((file.to_string(), name.clone()));
        }
        out.push(voice(name, vlang, uri, gender));
    }
    if let Some((file, name)) = exact_match.or(prefix_match) {
        for line in variants.lines().skip(1) {
            let cols: Vec<&str> = line.split_whitespace().collect();
            if cols.len() < 5 || cols[1] != "variant" {
                continue;
            }
            let variant = cols[4].trim_start_matches("!v/");
            let uri = format!("espeak:{file}+{variant}");
            if valid_voice_id(&uri) {
                out.push(voice(format!("{name} ({})", cols[3]), lang, uri, gender_of(cols[2])));
            }
        }
    }
    out
}

/// eSpeak's words per minute for NightReader's 0.5×–2× (175 is eSpeak's normal speed).
pub fn espeak_wpm(rate: f64) -> u32 {
    (175.0 * rate.clamp(0.5, 2.0)).round() as u32
}
/// speech-dispatcher's −100…100 rate scale (0 = normal).
pub fn spd_rate(rate: f64) -> i32 {
    ((rate.clamp(0.5, 2.0) - 1.0) * 100.0).round() as i32
}

/// The command that speaks stdin with this voice. None when no engine is available.
#[cfg(target_os = "linux")]
pub fn speak_command(voice: &str, rate: f64, lang: &str) -> Option<std::process::Command> {
    use std::process::Command;
    let lang = if valid_lang(lang) { lang.to_ascii_lowercase() } else { "en".into() };
    if let Some(file) = voice.strip_prefix("espeak:") {
        let mut c = Command::new(espeak_binary()?);
        c.args(["-s", &espeak_wpm(rate).to_string(), "-v", file, "--stdin"]);
        return Some(c);
    }
    if has_program("spd-say") {
        let mut c = Command::new("spd-say");
        c.args(["-e", "-w", "-r", &spd_rate(rate).to_string()]);
        if let Some(t) = voice.strip_prefix("spd-type:") {
            c.args(["-t", t, "-l", &lang]);
        } else if let Some(name) = voice.strip_prefix("spd:") {
            c.args(["-y", name]);
        } else {
            c.args(["-l", &lang]);
        }
        return Some(c);
    }
    let mut c = Command::new(espeak_binary()?);
    c.args(["-s", &espeak_wpm(rate).to_string(), "-v", &lang, "--stdin"]);
    Some(c)
}

#[cfg(target_os = "linux")]
fn has_program(name: &str) -> bool {
    std::env::var_os("PATH").map(|paths| std::env::split_paths(&paths).any(|p| p.join(name).is_file())).unwrap_or(false)
}
#[cfg(target_os = "linux")]
fn espeak_binary() -> Option<&'static str> {
    ["espeak-ng", "espeak"].into_iter().find(|b| has_program(b))
}

/// Run a listing command, giving up after a few seconds (speech-dispatcher can hang
/// on systems without a working audio setup).
#[cfg(target_os = "linux")]
fn listing(program: &str, args: &[&str]) -> Option<String> {
    use std::process::{Command, Stdio};
    use std::time::{Duration, Instant};
    let mut child = Command::new(program).args(args).stdout(Stdio::piped()).stderr(Stdio::null()).stdin(Stdio::null()).spawn().ok()?;
    let started = Instant::now();
    loop {
        if child.try_wait().ok()?.is_some() {
            let out = child.wait_with_output().ok()?;
            return out.status.success().then(|| String::from_utf8_lossy(&out.stdout).into_owned());
        }
        if started.elapsed() > Duration::from_secs(5) {
            let _ = child.kill();
            let _ = child.wait();
            return None;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
}

#[cfg(target_os = "linux")]
pub fn voices(lang: &str) -> Result<Vec<LinuxVoice>, String> {
    let lang = if valid_lang(lang) { lang.to_string() } else { "en".to_string() };
    let espeak = espeak_binary();
    let variant_listing = espeak.and_then(|b| listing(b, &["--voices=variant"])).unwrap_or_default();
    if has_program("spd-say") {
        if let Some(spd) = listing("spd-say", &["-L"]) {
            let found = parse_spd_voices(&spd, &lang, &parse_variant_genders(&variant_listing));
            if found.len() > 4 {
                return Ok(found);
            }
        }
    }
    if let Some(bin) = espeak {
        if let Some(list) = listing(bin, &["--voices"]) {
            return Ok(parse_espeak_voices(&list, &variant_listing, &lang));
        }
    }
    Err("No text-to-speech engine was found. Install speech-dispatcher or espeak-ng (for example: sudo apt install speech-dispatcher espeak-ng).".into())
}

/// Stop speech-dispatcher speaking (killing the client alone leaves the message playing).
#[cfg(target_os = "linux")]
pub fn cancel() {
    if has_program("spd-say") {
        let _ = listing("spd-say", &["-C"]);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    const SPD: &str = "                     NAME                 LANGUAGE                  VARIANT
                Afrikaans                       af                     none
           Afrikaans+Adam                       af                     Adam
  English (Great Britain)                    en-gb                     none
English (Great Britain)+Alicia                    en-gb                   Alicia
English (Great Britain)+Andy                    en-gb                     Andy
       English (America)                    en-us                     none
English (America)+Alicia                    en-us                   Alicia
";
    const VARIANTS: &str = "Pty Language       Age/Gender VoiceName          File                 Other Languages
 5  variant         --/M      Adam               !v/adam
 5  variant         --/F      Alicia             !v/Alicia
 5  variant         --/M      Andy               !v/Andy
";
    const ESPEAK: &str = "Pty Language       Age/Gender VoiceName          File                 Other Languages
 2  en-gb           --/M      English_(Great_Britain) gmw/en               (en 2)
 2  en-us           --/M      English_(America)  gmw/en-US            (en 3)
 5  en-us           --/F      us-mbrola-1        mb/mb-us1            (en 8)
 5  fr-fr           --/M      French_(France)    roa/fr               (fr 5)
";

    #[test]
    fn speech_dispatcher_voices_include_male_and_female_for_your_language() {
        let v = parse_spd_voices(SPD, "en-GB", &parse_variant_genders(VARIANTS));
        let names: Vec<_> = v.iter().map(|v| (v.name.as_str(), v.gender.as_str())).collect();
        assert!(names.contains(&("Male voice 1", "male")));
        assert!(names.contains(&("Female voice 1", "female")));
        assert!(names.contains(&("English (Great Britain)+Alicia", "female")));
        assert!(names.contains(&("English (Great Britain)+Andy", "male")));
        assert!(names.contains(&("Afrikaans", "")));
        // Variants of other languages are left out to keep the list short.
        assert!(!names.iter().any(|(n, _)| *n == "Afrikaans+Adam" || *n == "English (America)+Alicia"));
    }

    #[test]
    fn espeak_voices_with_gender_and_variants() {
        let v = parse_espeak_voices(ESPEAK, VARIANTS, "en-GB");
        assert_eq!(v[0], voice("English (Great Britain)", "en-gb", "espeak:gmw/en".into(), "male"));
        assert!(v.iter().any(|x| x.uri == "espeak:mb/mb-us1" && x.gender == "female"));
        assert!(v.iter().any(|x| x.uri == "espeak:gmw/en+Alicia" && x.gender == "female"));
        assert!(!v.iter().any(|x| x.uri.starts_with("espeak:roa/fr+")));
    }

    #[test]
    fn voice_ids_and_languages_are_checked() {
        for ok in ["", "spd-type:female2", "spd:English (Great Britain)+Alicia", "espeak:gmw/en+f3", "espeak:mb/mb-us1"] {
            assert!(valid_voice_id(ok), "{ok}");
        }
        for bad in ["spd-type:robot", "spd:-x", "espeak:../../etc/passwd", "espeak:--stdout", "espeak:a;b", "HKEY_X", "spd:a\nb"] {
            assert!(!valid_voice_id(bad), "{bad}");
        }
        assert!(valid_lang("en-GB") && valid_lang("pt") && valid_lang("zh-Hant"));
        assert!(!valid_lang("en GB") && !valid_lang("-l") && !valid_lang("english"));
        assert_eq!((espeak_wpm(1.0), espeak_wpm(9.0), spd_rate(0.5), spd_rate(2.0)), (175, 350, -50, 100));
    }
}
