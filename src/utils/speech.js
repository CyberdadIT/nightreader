import {isCapacitor,isTauri} from './platform.js';
export function splitSpeech(text) {
  return (text.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g)||[text]).flatMap(sentence=>sentence.match(/[\s\S]{1,220}(?:\s|$)|[\s\S]{1,220}/g)||[]).map(s=>s.trim()).filter(Boolean);
}
export async function speechVoices() {
  if(isTauri()){const {invoke}=await import("@tauri-apps/api/core");return invoke("get_speech_voices");}
  if(isCapacitor()){const {TextToSpeech}=await import('@capacitor-community/text-to-speech');return (await TextToSpeech.getSupportedVoices()).voices;}
  return window.speechSynthesis?.getVoices()||[];
}
export async function stopSpeech() {
  if(isTauri()){const {invoke}=await import("@tauri-apps/api/core");await invoke("stop_speech");return;}
  if(isCapacitor()){const {TextToSpeech}=await import('@capacitor-community/text-to-speech');await TextToSpeech.stop();}
  else window.speechSynthesis?.cancel();
}
export async function speakChunk(text,rate,voiceURI,voices) {
  if(isTauri()){const {invoke}=await import("@tauri-apps/api/core");await invoke("speak_text",{text,rate,voice:voiceURI});return;}
  const voice=voices.find(v=>v.voiceURI===voiceURI);
  if(isCapacitor()){
    const {TextToSpeech}=await import('@capacitor-community/text-to-speech');
    await TextToSpeech.speak({text,rate,lang:voice?.lang||'en-GB',voice:voice?voices.indexOf(voice):undefined,category:'playback'});return;
  }
  if(!window.speechSynthesis)throw new Error('Speech is unavailable on this device.');
  await new Promise((resolve,reject)=>{
    const utterance=new SpeechSynthesisUtterance(text);utterance.rate=rate;if(voice)utterance.voice=voice;
    utterance.onend=resolve;utterance.onerror=e=>e.error==='canceled'||e.error==='interrupted'?resolve():reject(new Error(`Speech failed: ${e.error}`));
    window.speechSynthesis.speak(utterance);
  });
}
