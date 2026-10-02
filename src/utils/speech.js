import {isCapacitor,isTauri} from './platform.js';

export function splitSpeech(text) {
  return (text.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g)||[text]).flatMap(sentence=>sentence.match(/[\s\S]{1,220}(?:\s|$)|[\s\S]{1,220}/g)||[]).map(s=>s.trim()).filter(Boolean);
}

// Well-known voice names whose gender the platform doesn't report (browsers, Android, older SAPI).
const MALE=/\b(david|mark|george|james|guy|ryan|thomas|daniel|alex|fred|oliver|arthur|rishi|aaron|tom|reed|eddy|grandpa|ravi|hemant|sean|liam|brian|christopher|eric|roger|steffan|william|andrew|davis|tony|jason|ollie|male)\b/i;
const FEMALE=/\b(zira|hazel|susan|heera|jenny|aria|libby|sonia|maisie|emma|ava|samantha|karen|moira|tessa|fiona|victoria|serena|kate|martha|allison|catherine|natasha|clara|michelle|ana|joanna|amy|salli|kimberly|nicole|female)\b/i;
export function voiceGender(voice) {
  if(voice?.gender==='male'||voice?.gender==='female')return voice.gender;
  const name=voice?.name||'';
  if(MALE.test(name))return 'male';
  if(FEMALE.test(name))return 'female';
  return '';
}

/** Label for the voice menu: "George · English (United Kingdom) · male". */
export function voiceLabel(voice) {
  let language=voice.lang||'';
  try { if(language)language=new Intl.DisplayNames([navigator.language||'en'],{type:'language'}).of(language)||language; } catch { /* unknown tag */ }
  const name=String(voice.name||'Voice').replace(/^Microsoft\s+/,'').replace(/\s+(Desktop|- .*)$/,'');
  return [name,language,voiceGender(voice),voice.localService===false?'online':''].filter(Boolean).join(' · ');
}

/** Voices sorted for the menu: this device's language first, then by language and name. */
export function sortVoices(voices) {
  const own=(navigator.language||'en-GB').toLowerCase(),base=own.split('-')[0];
  const rank=v=>{const l=(v.lang||'').toLowerCase().replace('_','-');return l===own?0:l.startsWith(base)?1:2;};
  return [...voices].sort((a,b)=>rank(a)-rank(b)||(a.lang||'').localeCompare(b.lang||'')||String(a.name).localeCompare(String(b.name)));
}

// Which engine speaks in the desktop app: the native one (Windows SAPI, Linux
// speech-dispatcher/eSpeak NG), or the web view's own if there is no native engine.
let desktopEngine='native';
export async function speechVoices() {
  if(isTauri()){
    const {invoke}=await import("@tauri-apps/api/core");
    try { desktopEngine='native'; return await invoke("get_speech_voices",{lang:navigator.language||'en'}); }
    catch(e){
      const web=window.speechSynthesis?.getVoices()||[];
      if(web.length){desktopEngine='web';return web;}
      throw e;
    }
  }
  if(isCapacitor()){
    const {TextToSpeech}=await import('@capacitor-community/text-to-speech');
    // The plugin selects a voice by its index in this list, so the index is kept as the id.
    return (await TextToSpeech.getSupportedVoices()).voices.map((v,i)=>({...v,voiceURI:`${i}:${v.voiceURI||v.name}`,index:i}));
  }
  return window.speechSynthesis?.getVoices()||[];
}
export async function stopSpeech() {
  if(isTauri()&&desktopEngine==='native'){const {invoke}=await import("@tauri-apps/api/core");await invoke("stop_speech");return;}
  if(isCapacitor()){const {TextToSpeech}=await import('@capacitor-community/text-to-speech');await TextToSpeech.stop();}
  else window.speechSynthesis?.cancel();
}

/** Length of the word starting at index (for engines that report only where a word starts). */
export function wordLengthAt(text,index) {
  const match=/^[^\s]+/.exec(text.slice(index));
  return match?match[0].replace(/[.,;:!?)"'’”]+$/,'').length||match[0].length:0;
}

/**
 * Speak one chunk. onWord(start, length) is called as each word is spoken, where the
 * platform reports it (Windows, Chromium/WebView2, Safari, Android and iOS). Offsets are
 * into `text`. A saved voice that no longer exists falls back to the default voice.
 */
export async function speakChunk(text,rate,voiceURI,voices,onWord) {
  const voice=voices.find(v=>v.voiceURI===voiceURI);
  if(isTauri()&&desktopEngine==='native'){
    const {invoke}=await import("@tauri-apps/api/core");
    let unlisten=null;
    if(onWord){const {listen}=await import("@tauri-apps/api/event");unlisten=await listen('speech-word',e=>onWord(e.payload.pos,e.payload.len));}
    try { await invoke("speak_text",{text,rate,voice:voice?voiceURI:'',lang:voice?.lang||navigator.language||'en'}); }
    finally { unlisten?.(); }
    return;
  }
  if(isCapacitor()){
    const {TextToSpeech}=await import('@capacitor-community/text-to-speech');
    const handle=onWord?await TextToSpeech.addListener('onRangeStart',info=>onWord(info.start,info.end-info.start)):null;
    try { await TextToSpeech.speak({text,rate,lang:voice?.lang||navigator.language||'en-GB',voice:voice?.index,category:'playback'}); }
    finally { await handle?.remove(); }
    return;
  }
  if(!window.speechSynthesis)throw new Error('Speech is unavailable on this device.');
  await new Promise((resolve,reject)=>{
    const utterance=new SpeechSynthesisUtterance(text);utterance.rate=rate;if(voice)utterance.voice=voice;
    if(onWord)utterance.onboundary=e=>{if(e.name==='word'||e.name==='')onWord(e.charIndex,e.charLength||wordLengthAt(text,e.charIndex));};
    utterance.onend=resolve;utterance.onerror=e=>e.error==='canceled'||e.error==='interrupted'?resolve():reject(new Error(`Speech failed: ${e.error}`));
    window.speechSynthesis.speak(utterance);
  });
}

export const VOICE_SAMPLE='This is how this voice sounds reading your documents.';
