import React,{useEffect,useRef,useState} from 'react';
import {useStore} from '../store/useStore.js';
import {speechVoices,stopSpeech,speakChunk,splitSpeech,voiceLabel,sortVoices,VOICE_SAMPLE} from '../utils/speech.js';
import {alignChunk,compact,wordOnScreen} from '../utils/speechAlign.js';
import {textRange} from '../utils/annotations.js';
import {forgetIndex} from '../utils/libraryIndex.js';
import {createOcrWorker,recognizePage} from '../utils/ocr.js';
import {ocrLanguage,installedOcrLanguages} from '../utils/ocrLanguages.js';
import styles from './ReadingTools.module.css';
export default function ReadingTools({doc}) {
  const tab=useStore(s=>s.getActiveTab()),rate=useStore(s=>s.speechRate),voice=useStore(s=>s.speechVoice),continuous=useStore(s=>s.speechContinuous),highlight=useStore(s=>s.speechHighlight);
  const [sleep,setSleep]=useState('off'),[sleepUntil,setSleepUntil]=useState(0);
  const unit=doc.kind==='epub'?'chapter':'page';
  const [voices,setVoices]=useState([]),[state,setState]=useState('idle'),[message,setMessage]=useState('');
  const [ocrBusy,setOcrBusy]=useState(false),[all,setAll]=useState(false);
  const speech=useRef({token:0,chunks:[],index:0,continuing:false,cursor:0,screenText:null,screen:null}),worker=useRef(null),cancelOcr=useRef(false),alive=useRef(true), abortOcr=useRef(null);
  const speakingPage=tab?.page||1;
  useEffect(()=>{
    let cancelled=false;const refresh=()=>speechVoices().then(v=>{if(!cancelled)setVoices(sortVoices(v));}).catch(()=>{});
    refresh();window.speechSynthesis?.addEventListener('voiceschanged',refresh);
    return()=>{cancelled=true;window.speechSynthesis?.removeEventListener('voiceschanged',refresh);};
  },[]);
  // A page change stops reading, unless read aloud itself moved on to the next page.
  useEffect(()=>{
    if(speech.current.continuing){speech.current.continuing=false;play({auto:true});return;}
    speech.current.token++;stopSpeech().catch(()=>{});setState('idle');speech.current.chunks=[];clearMark();
  },[doc,speakingPage]);
  // Sleep timer: stop exactly on time, even mid-sentence.
  useEffect(()=>{
    if(!sleepUntil)return;
    const t=setTimeout(()=>{speech.current.token++;speech.current.continuing=false;stopSpeech().catch(()=>{});setState('idle');setSleep('off');setSleepUntil(0);setMessage('Sleep timer: read aloud stopped.');},Math.max(0,sleepUntil-Date.now()));
    return()=>clearTimeout(t);
  },[sleepUntil]);
  function chooseSleep(value){setSleep(value);setSleepUntil(/^\d+$/.test(value)?Date.now()+Number(value)*60000:0);}
  useEffect(()=>{
    alive.current=true;
    return()=>{alive.current=false;speech.current.token++;stopSpeech().catch(()=>{});clearMark();cancelOcr.current=true;abortOcr.current?.();worker.current?.terminate();};
  },[doc]);
  // Move to the next page/chapter and keep reading, if continuous reading allows it.
  function advance(){
    if(!continuous||sleep==='end'||speakingPage>=doc.numPages)return false;
    speech.current.continuing=true;useStore.getState().setCurrentPage(speakingPage+1);return true;
  }
  async function play({auto=false}={}){
    const run=++speech.current.token;
    try {
      if(auto||state!=='paused'){
        const text=await doc.getPageText(speakingPage);if(run!==speech.current.token)return;
        if(!text.trim()){
          // Blank pages (covers, dividers) are skipped while reading continuously.
          if(auto&&advance())return;
          throw new Error(`No readable text on this ${unit}.${doc.kind==='pdf'?' Run OCR for a scanned PDF.':''}`);
        }
        speech.current.chunks=splitSpeech(text);speech.current.index=0;
      }
      setState('playing');setMessage('');
      const page=speakingPage;
      while(speech.current.index<speech.current.chunks.length&&run===speech.current.token){
        const chunk=speech.current.chunks[speech.current.index];
        const align=markSentence(page,chunk);
        await speakChunk(chunk,rate,voice,voices,align?(pos,len)=>{if(run===speech.current.token)markWord(page,align,pos,len);}:undefined);
        if(run!==speech.current.token)return;speech.current.index++;
      }
      if(!alive.current||run!==speech.current.token)return;
      clearMark();
      if(advance())return;
      setState('idle');
      if(sleep==='end'){setSleep('off');setMessage(`Sleep timer: stopped at the end of the ${unit}.`);}
      else if(speakingPage>=doc.numPages)setMessage(`Finished reading ${doc.kind==='epub'?'the book':'the document'}.`);
    }catch(e){if(alive.current&&run===speech.current.token){setMessage(e.message);setState('idle');}}
  }
  async function pause(){speech.current.token++;speech.current.continuing=false;setState('paused');await stopSpeech().catch(()=>{});}
  async function stop(){speech.current.token++;speech.current.continuing=false;setState('idle');speech.current.chunks=[];clearMark();await stopSpeech().catch(()=>{});}
  // ── Read-along highlighting ────────────────────────────────────────────
  function screenRoot(page){return document.querySelector(`[data-viewer-scroll][data-active="true"] [data-text-root][data-page-number="${page}"]`);}
  function clearMark(){if(useStore.getState().speechMark)useStore.getState().setSpeechMark(null);speech.current.cursor=0;}
  /** Highlight the sentence about to be spoken; returns its alignment for word marks. */
  function markSentence(page,chunk){
    if(!useStore.getState().speechHighlight)return null;
    const root=screenRoot(page);if(!root)return null;
    const text=root.textContent||'';
    if(speech.current.screenText!==text){speech.current.screenText=text;speech.current.screen=compact(text);}
    const align=alignChunk(speech.current.screen,chunk,speech.current.cursor||0);
    if(!align){useStore.getState().setSpeechMark(null);return null;}
    speech.current.cursor=align.end;
    useStore.getState().setSpeechMark({path:tab?.path,page,start:align.start,end:align.end,word:null});
    keepVisible(root,align.start,align.end);
    return align;
  }
  function markWord(page,align,pos,len){
    const word=wordOnScreen(align,pos,len),mark=useStore.getState().speechMark;
    if(!word||!mark||mark.page!==page)return;
    useStore.getState().setSpeechMark({...mark,word});
    const root=screenRoot(page);if(root)keepVisible(root,word.start,word.end);
  }
  /** Scroll just enough to keep the spoken text in view. */
  function keepVisible(root,start,end){
    const view=root.closest('[data-viewer-scroll]'),range=textRange(root,start,end);if(!view||!range)return;
    const r=range.getBoundingClientRect(),v=view.getBoundingClientRect();
    if(!r.height)return;
    if(r.bottom>v.bottom-40||r.top<v.top+40)view.scrollBy({top:r.top-v.top-v.height/3,behavior:'smooth'});
  }
  async function preview(){
    if(state==='playing')return;
    try{await stopSpeech().catch(()=>{});await speakChunk(VOICE_SAMPLE,rate,voice,voices);}catch(e){setMessage(e.message);}
  }
  async function scan(){
    const language=useStore.getState().ocrLanguage||'eng',languageName=ocrLanguage(language)?.name||'English';
    setOcrBusy(true);cancelOcr.current=false;setMessage(`Preparing local ${languageName} OCR…`);
    let done=0,skipped=0;
    const aborted=new Promise((_,reject)=>{abortOcr.current=()=>reject(new Error('OCR cancelled'));});
    aborted.catch(()=>{});
    try {
      const w=await createOcrWorker(info=>{if(alive.current&&!cancelOcr.current)setMessage(`${info.status} ${Math.round((info.progress||0)*100)}%`);},language);worker.current=w;if(!alive.current||cancelOcr.current){await w.terminate();return;}
      const first=all?1:speakingPage,last=all?doc.numPages:speakingPage;
      for(let page=first;page<=last&&!cancelOcr.current;page++){
        if(alive.current)setMessage(`OCR page ${page} of ${last}…`);
        const result=await Promise.race([recognizePage(w,doc,page),aborted]);
        if(result.skipped)skipped++;else done++;
        if(alive.current)useStore.getState().bumpOcrVersion();
      }
      if(done&&!doc.passwordProtected)forgetIndex(doc.documentId); // re-index with the new text next time the library is searched
      if(alive.current)setMessage(`OCR complete: ${done} scanned pages recognised; ${skipped} pages already had text.`);
    }catch(e){if(alive.current)setMessage(cancelOcr.current?'OCR cancelled. Completed pages are saved.':`OCR failed: ${e.message}`);}
    finally{await worker.current?.terminate().catch(()=>{});worker.current=null;abortOcr.current=null;if(alive.current)setOcrBusy(false);}
  }
  return <section className={styles.tools} aria-label="Read aloud and OCR">
    <div className={styles.row}><button onClick={state==='playing'?pause:play}>{state==='playing'?'Pause':state==='paused'?'Resume':'Read aloud'}</button><button disabled={state==='idle'} onClick={stop}>Stop</button>
      <label>Voice<select aria-label="Speech voice" value={voices.some(v=>v.voiceURI===voice)?voice:''} disabled={state==='playing'} onChange={e=>useStore.getState().setSpeechVoice(e.target.value)} title={voices.length<=1?'Add more voices in Windows Settings → Time & language → Speech, or in your phone\'s text-to-speech settings':undefined}><option value="">Device default</option>{voices.map((v,i)=><option key={`${v.voiceURI}:${i}`} value={v.voiceURI}>{voiceLabel(v)}</option>)}</select></label>
      <button onClick={preview} disabled={state==='playing'} aria-label="Preview voice" title="Hear this voice">▶ Preview</button>
      <label title="Highlight each sentence and word as it is read"><input type="checkbox" checked={highlight} onChange={e=>{useStore.getState().setSpeechHighlight(e.target.checked);if(!e.target.checked)clearMark();}}/> Follow along</label>
      <label title={`Carry on to the next ${unit} automatically`}><input type="checkbox" checked={continuous} onChange={e=>useStore.getState().setSpeechContinuous(e.target.checked)}/> Continuous</label>
      <label>Sleep<select aria-label="Sleep timer" value={sleep} onChange={e=>chooseSleep(e.target.value)}><option value="off">Off</option>{[15,30,45,60,90].map(m=><option key={m} value={m}>{m} min</option>)}<option value="end">End of {unit}</option></select></label>
      <label>Speed<select aria-label="Speech speed" value={rate} disabled={state==='playing'} onChange={e=>useStore.getState().setSpeechRate(Number(e.target.value))}>{[.5,.75,1,1.25,1.5,1.75,2].map(r=><option key={r} value={r}>{r}×</option>)}</select></label>
      {doc.kind==='pdf'&&<><label><input type="checkbox" checked={all} disabled={ocrBusy} onChange={e=>setAll(e.target.checked)}/> All pages</label><OcrLanguagePicker disabled={ocrBusy}/><button disabled={ocrBusy} onClick={scan}>OCR {all?'document':'this page'}</button>{ocrBusy&&<button onClick={()=>{cancelOcr.current=true;setMessage('OCR cancelled. Completed pages are saved.');abortOcr.current?.();worker.current?.terminate();}}>Cancel OCR</button>}</>}
    </div>
    {state==='paused'&&<p>Resume repeats the current sentence.</p>}
    {sleepUntil>0&&<p>Sleep timer: read aloud stops at {new Date(sleepUntil).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}.</p>}
    {message&&<p role="status">{message}</p>}
  </section>;
}

/** OCR language: English plus any packs downloaded in NightReader settings. */
function OcrLanguagePicker({disabled}){
  const language=useStore(s=>s.ocrLanguage)||'eng';
  const [installed,setInstalled]=React.useState(['eng']);
  React.useEffect(()=>{let live=true;installedOcrLanguages().then(list=>{if(live)setInstalled(list);});return()=>{live=false;};},[]);
  const options=installed.includes(language)?installed:[...installed,language];
  return <label title="More languages can be downloaded in NightReader settings">OCR language<select aria-label="OCR language" value={language} disabled={disabled} onChange={e=>useStore.getState().setOcrLanguage(e.target.value)}>
    {options.map(code=><option key={code} value={code}>{ocrLanguage(code)?.name||code}{installed.includes(code)?'':' (not downloaded)'}</option>)}
  </select></label>;
}
