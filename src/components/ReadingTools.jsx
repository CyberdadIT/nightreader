import React,{useEffect,useRef,useState} from 'react';
import {useStore} from '../store/useStore.js';
import {speechVoices,stopSpeech,speakChunk,splitSpeech} from '../utils/speech.js';
import {createOcrWorker,recognizePage} from '../utils/ocr.js';
import styles from './ReadingTools.module.css';
export default function ReadingTools({doc}) {
  const tab=useStore(s=>s.getActiveTab()),rate=useStore(s=>s.speechRate),voice=useStore(s=>s.speechVoice),continuous=useStore(s=>s.speechContinuous);
  const [sleep,setSleep]=useState('off'),[sleepUntil,setSleepUntil]=useState(0);
  const unit=doc.kind==='epub'?'chapter':'page';
  const [voices,setVoices]=useState([]),[state,setState]=useState('idle'),[message,setMessage]=useState('');
  const [ocrBusy,setOcrBusy]=useState(false),[all,setAll]=useState(false);
  const speech=useRef({token:0,chunks:[],index:0,continuing:false}),worker=useRef(null),cancelOcr=useRef(false),alive=useRef(true), abortOcr=useRef(null);
  const speakingPage=tab?.page||1;
  useEffect(()=>{
    let cancelled=false;const refresh=()=>speechVoices().then(v=>{if(!cancelled)setVoices(v);}).catch(()=>{});
    refresh();window.speechSynthesis?.addEventListener('voiceschanged',refresh);
    return()=>{cancelled=true;window.speechSynthesis?.removeEventListener('voiceschanged',refresh);};
  },[]);
  // A page change stops reading, unless read aloud itself moved on to the next page.
  useEffect(()=>{
    if(speech.current.continuing){speech.current.continuing=false;play({auto:true});return;}
    speech.current.token++;stopSpeech().catch(()=>{});setState('idle');speech.current.chunks=[];
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
    return()=>{alive.current=false;speech.current.token++;stopSpeech().catch(()=>{});cancelOcr.current=true;abortOcr.current?.();worker.current?.terminate();};
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
      while(speech.current.index<speech.current.chunks.length&&run===speech.current.token){
        await speakChunk(speech.current.chunks[speech.current.index],rate,voice,voices);
        if(run!==speech.current.token)return;speech.current.index++;
      }
      if(!alive.current||run!==speech.current.token)return;
      if(advance())return;
      setState('idle');
      if(sleep==='end'){setSleep('off');setMessage(`Sleep timer: stopped at the end of the ${unit}.`);}
      else if(speakingPage>=doc.numPages)setMessage(`Finished reading ${doc.kind==='epub'?'the book':'the document'}.`);
    }catch(e){if(alive.current&&run===speech.current.token){setMessage(e.message);setState('idle');}}
  }
  async function pause(){speech.current.token++;speech.current.continuing=false;setState('paused');await stopSpeech().catch(()=>{});}
  async function stop(){speech.current.token++;speech.current.continuing=false;setState('idle');speech.current.chunks=[];await stopSpeech().catch(()=>{});}
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
      <label title={`Carry on to the next ${unit} automatically`}><input type="checkbox" checked={continuous} onChange={e=>useStore.getState().setSpeechContinuous(e.target.checked)}/> Continuous</label>
      <label>Sleep<select aria-label="Sleep timer" value={sleep} onChange={e=>chooseSleep(e.target.value)}><option value="off">Off</option>{[15,30,45,60,90].map(m=><option key={m} value={m}>{m} min</option>)}<option value="end">End of {unit}</option></select></label>
      <label>Speed<select aria-label="Speech speed" value={rate} disabled={state==='playing'} onChange={e=>useStore.getState().setSpeechRate(Number(e.target.value))}>{[.5,.75,1,1.25,1.5,1.75,2].map(r=><option key={r} value={r}>{r}×</option>)}</select></label>
      {doc.kind==='pdf'&&<><label><input type="checkbox" checked={all} disabled={ocrBusy} onChange={e=>setAll(e.target.checked)}/> All pages</label><button disabled={ocrBusy} onClick={scan}>OCR {all?'document':'this page'}</button>{ocrBusy&&<button onClick={()=>{cancelOcr.current=true;setMessage('OCR cancelled. Completed pages are saved.');abortOcr.current?.();worker.current?.terminate();}}>Cancel OCR</button>}</>}
    </div>
    {state==='paused'&&<p>Resume repeats the current sentence.</p>}
    {sleepUntil>0&&<p>Sleep timer: read aloud stops at {new Date(sleepUntil).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}.</p>}
    {message&&<p role="status">{message}</p>}
  </section>;
}
