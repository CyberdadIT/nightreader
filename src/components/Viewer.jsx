import React,{useRef,useState,useEffect,useLayoutEffect} from 'react';
import {useStore} from '../store/useStore.js';
import {selectionAnchor} from '../utils/annotations.js';
import PdfPage from './PdfPage.jsx';
import EpubChapter from './EpubChapter.jsx';
import styles from './Viewer.module.css';
export default function Viewer({pdf}) {
  const container=useRef(null),scrollPage=useRef(null), ignoreScrollUntil=useRef(0);
  const tab=useStore(s=>s.getActiveTab()),scroll=useStore(s=>s.scrollMode),spread=useStore(s=>s.spread),brightness=useStore(s=>s.brightness),mode=useStore(s=>s.readingMode);
  const navigationVersion=useStore(s=>s.navigationVersion);
  const page=tab?.page||1,[size,setSize]=useState({width:800,height:600}),[popup,setPopup]=useState(null),[message,setMessage]=useState('');
  useEffect(()=>{
    const el=container.current;const observer=new ResizeObserver(()=>setSize({width:el.clientWidth-32,height:el.clientHeight-32}));observer.observe(el);return()=>observer.disconnect();
  },[]);
  useEffect(()=>{setPopup(null);},[tab?.path,page,pdf]);
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
    <div aria-hidden="true" style={{position:'absolute',inset:0,background:`rgba(0,0,0,${(100-brightness)/120})`,pointerEvents:'none',zIndex:20}}/>
    {message&&<p role="status">{message}</p>}
    {popup&&<div className="selectionPopup" role="toolbar" aria-label="Selected text actions" style={{position:'fixed',left:Math.max(8,Math.min(popup.x,window.innerWidth-290)),top:Math.max(8,Math.min(popup.y+8,window.innerHeight-100)),zIndex:300}} onPointerDown={e=>e.preventDefault()}>
      <button onClick={async()=>{try{await navigator.clipboard.writeText(popup.quote);setPopup(null);}catch{setMessage('Clipboard is unavailable. Use your device copy command.');}}}>Copy</button>
      {['yellow','blue','pink','green'].map(c=><button key={c} aria-label={`Highlight ${c}`} onClick={()=>annotate(`hl-${c}`)} style={{background:{yellow:'#ffdf00',blue:'#4fc3f7',pink:'#f48fb1',green:'#a5d6a7'}[c],color:'#111'}}>●</button>)}
      <button onClick={()=>annotate('underline')}>Underline</button><button onClick={()=>annotate('strikethrough')}>Strike</button><button onClick={()=>annotate('note')}>Note</button><button aria-label="Close selection actions" onClick={()=>{setPopup(null);window.getSelection()?.removeAllRanges();}}>×</button>
    </div>}
    <div ref={container} data-viewer-scroll onScroll={onScroll} className={styles.readingArea} style={{background:mode==='light'?'#ddd':mode==='sepia'?'#bfae8c':'#0d1117',flexDirection:spread&&pdf.kind==='pdf'?'row':'column',alignItems:spread?'flex-start':'center'}}>
      {pdf.kind==='epub'?<EpubChapter book={pdf} page={page}/>:pages.map(n=><PdfPage key={`${tab.path}:${n}`} pdf={pdf} pageNumber={n} availableWidth={spread?(size.width-16)/2:size.width} availableHeight={size.height} scrollRoot={container}/>)}
    </div>
  </div>;
}
