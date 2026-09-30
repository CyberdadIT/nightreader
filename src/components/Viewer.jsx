import React,{useRef,useState,useEffect,useLayoutEffect} from 'react';
import {useStore} from '../store/useStore.js';
import {selectionAnchor} from '../utils/annotations.js';
import {stepZoom,wheelPageTurn,wheelPixels} from '../utils/navigation.js';
import PdfPage from './PdfPage.jsx';
import EpubChapter from './EpubChapter.jsx';
import DefinitionCard from './DefinitionCard.jsx';
import {isSingleWord} from '../utils/dictionary.js';
import styles from './Viewer.module.css';
export default function Viewer({pdf}) {
  const container=useRef(null),scrollPage=useRef(null), ignoreScrollUntil=useRef(0);
  const tab=useStore(s=>s.getActiveTab()),scroll=useStore(s=>s.scrollMode),spread=useStore(s=>s.spread),brightness=useStore(s=>s.brightness),mode=useStore(s=>s.readingMode);
  const navigationVersion=useStore(s=>s.navigationVersion);
  const page=tab?.page||1,[size,setSize]=useState({width:800,height:600}),[popup,setPopup]=useState(null),[lookup,setLookup]=useState(null),[message,setMessage]=useState('');
  useEffect(()=>{
    const el=container.current;const observer=new ResizeObserver(()=>setSize({width:el.clientWidth-32,height:el.clientHeight-32}));observer.observe(el);return()=>observer.disconnect();
  },[]);
  useEffect(()=>{setPopup(null);setLookup(null);},[tab?.path,page,pdf]);
  // Page-by-page view: start each new page at the top, or at the bottom when
  // the wheel moved back from the next page, so reading flows continuously.
  const enterEdge=useRef(null);
  useLayoutEffect(()=>{
    if(scroll&&pdf.kind!=='epub')return;
    const el=container.current,edge=enterEdge.current;enterEdge.current=null;
    if(edge!=='bottom'){el.scrollTop=0;return;}
    const toBottom=()=>{el.scrollTop=el.scrollHeight;};
    toBottom();const frame=requestAnimationFrame(toBottom),late=setTimeout(toBottom,120);
    return()=>{cancelAnimationFrame(frame);clearTimeout(late);};
  },[page,tab?.path,scroll,pdf.kind]);
  // Mouse wheel and trackpad. Ctrl+wheel zooms (PDF) or resizes text (EPUB).
  // Outside continuous-scroll mode, scrolling past the top or bottom edge turns the page.
  useEffect(()=>{
    const el=container.current,wheel={acc:0,dir:0,lockUntil:0,zoomAcc:0};
    function onWheel(e){
      const s=useStore.getState(),dy=wheelPixels(e,el.clientHeight);
      if(e.ctrlKey||e.metaKey){
        e.preventDefault();wheel.zoomAcc+=dy;
        if(Math.abs(wheel.zoomAcc)<50)return;
        const dir=wheel.zoomAcc<0?1:-1;wheel.zoomAcc=0;
        if(pdf.kind==='epub')s.setFontSize(Math.max(12,Math.min(24,s.fontSize+dir)));else s.setZoom(stepZoom(s.zoom,dir));
        return;
      }
      if(s.scrollMode&&pdf.kind!=='epub')return;
      const now=Date.now();
      // Swallow trackpad momentum straight after a page turn so it doesn't skip pages.
      if(now<wheel.lockUntil){if(Math.sign(dy)===wheel.dir)e.preventDefault();return;}
      const dir=wheelPageTurn({deltaX:e.deltaX,deltaY:dy,scrollTop:el.scrollTop,clientHeight:el.clientHeight,scrollHeight:el.scrollHeight});
      if(!dir){wheel.acc=0;return;}
      const current=s.getActiveTab();if(!current)return;
      const step=s.spread&&pdf.kind!=='epub'?2:1,total=current.totalPages||1;
      if(dir>0?current.page+step>total:current.page<=1){wheel.acc=0;return;}
      e.preventDefault();
      if(dir!==wheel.dir){wheel.acc=0;wheel.dir=dir;}
      // One mouse-wheel notch (~100px) turns the page; a trackpad needs a deliberate push past the edge.
      wheel.acc+=Math.abs(dy);if(wheel.acc<60)return;
      wheel.acc=0;wheel.lockUntil=now+350;
      enterEdge.current=dir>0?'top':'bottom';
      s.setCurrentPage(current.page+dir*step);
    }
    el.addEventListener('wheel',onWheel,{passive:false});
    return()=>el.removeEventListener('wheel',onWheel);
  },[pdf]);
  useLayoutEffect(()=>{
    if(!scroll||pdf.kind==='epub')return;
    ignoreScrollUntil.current=Date.now()+250;
    container.current.querySelector(`[data-page="${page}"]`)?.scrollIntoView({block:'start',behavior:'instant'});
  },[navigationVersion,scroll,pdf.kind]);
  useEffect(()=>{
    const el=container.current;
    function selected(){
      const selection=window.getSelection();if(!selection?.rangeCount||selection.isCollapsed)return;
      const range=selection.getRangeAt(0),start=range.startContainer.parentElement?.closest('[data-text-root]');
      if(!start||!el.contains(start)||!start.contains(range.endContainer))return;
      const quote=range.toString();if(!quote.trim())return;
      const bounds=start.getBoundingClientRect(),vp=start._pdfViewport;
      const rects=Array.from(range.getClientRects()).filter(r=>r.width>0&&r.height>0);
      const pdfRects=vp?rects.map(r=>{const a=vp.convertToPdfPoint(r.left-bounds.left,r.top-bounds.top),b=vp.convertToPdfPoint(r.right-bounds.left,r.bottom-bounds.top);return [...a,...b];}):null;
      const anchor=selectionAnchor(start,range),last=rects[rects.length-1];
      setPopup({quote,page:Number(start.dataset.pageNumber),...anchor,pdfRects,x:last?.left||20,y:last?.bottom||40});
    }
    // Native long-press selection on iOS/Android also emits selectionchange.
    let timer;const changed=()=>{clearTimeout(timer);timer=setTimeout(selected,180);};
    el.addEventListener('pointerup',changed);document.addEventListener('selectionchange',changed);
    return()=>{clearTimeout(timer);el.removeEventListener('pointerup',changed);document.removeEventListener('selectionchange',changed);};
  },[pdf,tab?.path]);
  function annotate(type){if(!popup)return;const {x,y,...anchor}=popup;useStore.getState().addAnnotation({...anchor,filePath:tab.path,type,note:''});setPopup(null);window.getSelection()?.removeAllRanges();}
  function onScroll(){
    if(!scroll||pdf.kind==='epub'||Date.now()<ignoreScrollUntil.current)return;
    const el=container.current,top=el.getBoundingClientRect().top;let best=page,distance=Infinity;
    el.querySelectorAll('[data-page]').forEach(p=>{const d=Math.abs(p.getBoundingClientRect().top-top);if(d<distance){distance=d;best=Number(p.dataset.page);}});
    if(best!==page){scrollPage.current=best;useStore.getState().setCurrentPage(best,true);}
  }
  const pages=scroll?Array.from({length:pdf.numPages},(_,i)=>i+1):spread?[page,...(page<pdf.numPages?[page+1]:[])]:[page];
  return <div style={{flex:1,minHeight:0,position:'relative',display:'flex',flexDirection:'column'}}>
    <div aria-hidden="true" style={{position:'absolute',inset:0,background:`rgba(0,0,0,${(100-brightness)/110})`,pointerEvents:'none',zIndex:20}}/>
    {message&&<p role="status">{message}</p>}
    {lookup&&<DefinitionCard {...lookup} onClose={()=>setLookup(null)}/>}
    {popup&&<div className="selectionPopup" role="toolbar" aria-label="Selected text actions" style={{position:'fixed',left:Math.max(8,Math.min(popup.x,window.innerWidth-290)),top:Math.max(8,Math.min(popup.y+8,window.innerHeight-100)),zIndex:300}} onPointerDown={e=>e.preventDefault()}>
      <button onClick={async()=>{try{await navigator.clipboard.writeText(popup.quote);setPopup(null);}catch{setMessage('Clipboard is unavailable. Use your device copy command.');}}}>Copy</button>
      {isSingleWord(popup.quote)&&<button onClick={()=>{setLookup({word:popup.quote.trim(),x:popup.x,y:popup.y});setPopup(null);}}>Define</button>}
      {['yellow','blue','pink','green'].map(c=><button key={c} aria-label={`Highlight ${c}`} onClick={()=>annotate(`hl-${c}`)} style={{background:{yellow:'#ffdf00',blue:'#4fc3f7',pink:'#f48fb1',green:'#a5d6a7'}[c],color:'#111'}}>●</button>)}
      <button onClick={()=>annotate('underline')}>Underline</button><button onClick={()=>annotate('strikethrough')}>Strike</button><button onClick={()=>annotate('note')}>Note</button><button aria-label="Close selection actions" onClick={()=>{setPopup(null);window.getSelection()?.removeAllRanges();}}>×</button>
    </div>}
    <div ref={container} data-viewer-scroll onScroll={onScroll} className={styles.readingArea} style={{background:mode==='light'?'#ddd':mode==='sepia'?'#bfae8c':'#0d1117',flexDirection:spread&&pdf.kind==='pdf'?'row':'column',alignItems:spread?'flex-start':'center'}}>
      {pdf.kind==='epub'?<EpubChapter book={pdf} page={page}/>:pages.map(n=><PdfPage key={`${tab.path}:${n}`} pdf={pdf} pageNumber={n} availableWidth={spread?(size.width-16)/2:size.width} availableHeight={size.height} scrollRoot={container}/>)}
    </div>
  </div>;
}
