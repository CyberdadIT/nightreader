import React,{useEffect,useRef,useState} from 'react';
import {useStore} from '../store/useStore.js';
import {speechVoices,stopSpeech,speakChunk,splitSpeech} from '../utils/speech.js';
import {createOcrWorker,recognizePage} from '../utils/ocr.js';
import styles from './ReadingTools.module.css';
export default function ReadingTools({doc}) {
  const tab=useStore(s=>s.getActiveTab()),rate=useStore(s=>s.speechRate),voice=useStore(s=>s.speechVoice);
  const [voices,setVoices]=useState([]),[state,setState]=useState('idle'),[message,setMessage]=useState('');
  const [ocrBusy,setOcrBusy]=useState(false),[all,setAll]=useState(false);
  const speech=useRef({token:0,chunks:[],index:0}),worker=useRef(null),cancelOcr=useRef(false),alive=useRef(true), abortOcr=useRef(null);
  const speakingPage=tab?.page||1;
  useEffect(()=>{
    let cancelled=false;const refresh=()=>speechVoices().then(v=>{if(!cancelled)setVoices(v);}).catch(()=>{});
    refresh();window.speechSynthesis?.addEventListener('voiceschanged',refresh);
    return()=>{cancelled=true;window.speechSynthesis?.removeEventListener('voiceschanged',refresh);};
  },[]);
  useEffect(()=>{
    speech.current.token++;stopSpeech().catch(()=>{});setState('idle');speech.current.chunks=[];
  },[doc,speakingPage]);
  useEffect(()=>{
    alive.current=true;
    return()=>{alive.current=false;speech.current.token++;stopSpeech().catch(()=>{});cancelOcr.current=true;abortOcr.current?.();worker.current?.terminate();};
  },[doc]);
  async function play(){
    const run=++speech.current.token;
    try {
      if(state!=='paused'){
        const text=await doc.getPageText(speakingPage);if(run!==speech.current.token)return;
        if(!text.trim())throw new Error('No readable text on this page. Run OCR for a scanned PDF.');
        speech.current.chunks=splitSpeech(text);speech.current.index=0;
      }
      setState('playing');setMessage('');
      while(speech.current.index<speech.current.chunks.length&&run===speech.current.token){
        await speakChunk(speech.current.chunks[speech.current.index],rate,voice,voices);
        if(run!==speech.current.token)return;speech.current.index++;
      }
      if(alive.current&&run===speech.current.token)setState('idle');
    }catch(e){if(alive.current&&run===speech.current.token){setMessage(e.message);setState('idle');}}
  }
  async function pause(){speech.current.token++;setState('paused');await stopSpeech().catch(()=>{});}
  async function stop(){speech.current.token++;setState('idle');speech.current.chunks=[];await stopSpeech().catch(()=>{});}
  async function scan(){
    setOcrBusy(true);cancelOcr.current=false;setMessage('Preparing local English OCR…');
    let done=0,skipped=0;
    const aborted=new Promise((_,reject)=>{abortOcr.current=()=>reject(new Error('OCR cancelled'));});
    aborted.catch(()=>{});
    try {
      const w=await createOcrWorker(info=>{if(alive.current&&!cancelOcr.current)setMessage(`${info.status} ${Math.round((info.progress||0)*100)}%`);});worker.current=w;if(!alive.current||cancelOcr.current){await w.terminate();return;}
      const first=all?1:speakingPage,last=all?doc.numPages:speakingPage;
      for(let page=first;page<=last&&!cancelOcr.current;page++){
        if(alive.current)setMessage(`OCR page ${page} of ${last}…`);
        const result=await Promise.race([recognizePage(w,doc,page),aborted]);
        if(result.skipped)skipped++;else done++;
        if(alive.current)useStore.getState().bumpOcrVersion();
      }
      if(alive.current)setMessage(`OCR complete: ${done} scanned pages recognised; ${skipped} pages already had text.`);
    }catch(e){if(alive.current)setMessage(cancelOcr.current?'OCR cancelled. Completed pages are saved.':`OCR failed: ${e.message}`);}
    finally{await worker.current?.terminate().catch(()=>{});worker.current=null;abortOcr.current=null;if(alive.current)setOcrBusy(false);}
  }
  return <section className={styles.tools} aria-label="Read aloud and OCR">
    <div className={styles.row}><button onClick={state==='playing'?pause:play}>{state==='playing'?'Pause':state==='paused'?'Resume':'Read aloud'}</button><button disabled={state==='idle'} onClick={stop}>Stop</button>
      <label>Voice<select aria-label="Speech voice" value={voice} disabled={state==='playing'} onChange={e=>useStore.getState().setSpeechVoice(e.target.value)}><option value="">Device default</option>{voices.map((v,i)=><option key={`${v.voiceURI}:${i}`} value={v.voiceURI}>{v.name} ({v.lang}){v.localService?'':' · online'}</option>)}</select></label>
      <label>Speed<select aria-label="Speech speed" value={rate} disabled={state==='playing'} onChange={e=>useStore.getState().setSpeechRate(Number(e.target.value))}>{[.5,.75,1,1.25,1.5,1.75,2].map(r=><option key={r} value={r}>{r}×</option>)}</select></label>
      {doc.kind==='pdf'&&<><label><input type="checkbox" checked={all} disabled={ocrBusy} onChange={e=>setAll(e.target.checked)}/> All pages</label><button disabled={ocrBusy} onClick={scan}>OCR {all?'document':'this page'}</button>{ocrBusy&&<button onClick={()=>{cancelOcr.current=true;setMessage('OCR cancelled. Completed pages are saved.');abortOcr.current?.();worker.current?.terminate();}}>Cancel OCR</button>}</>}
    </div>
    {state==='paused'&&<p>Resume repeats the current sentence. Read aloud reads the current {doc.kind==='epub'?'chapter':'page'}.</p>}
    {message&&<p role="status">{message}</p>}
  </section>;
}
