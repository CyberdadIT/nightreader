import React,{useEffect,useState} from 'react';
import {useStore} from '../store/useStore.js';
import {textRange,findQuote,matchingOffsets} from '../utils/annotations.js';
const colors={yellow:'rgba(255,214,0,.38)',blue:'rgba(79,195,247,.38)',pink:'rgba(244,143,177,.38)',green:'rgba(165,214,167,.38)'};
export default function TextDecorations({rootRef,ready,page,viewport,layoutKey,docPath}) {
  const annotations=useStore(s=>s.annotations),query=useStore(s=>s.searchQuery),speech=useStore(s=>s.speechMark);
  const [rects,setRects]=useState([]);
  useEffect(()=>{
    const root=rootRef.current;if(!root||!ready){setRects([]);return;}
    const draw=()=>{
      const bounds=root.getBoundingClientRect(),text=root.textContent||'',result=[];
      const addRange=(start,end,type)=>{
        const range=textRange(root,start,end);if(!range)return;
        for(const r of range.getClientRects())if(r.width&&r.height)result.push({left:r.left-bounds.left,top:r.top-bounds.top,width:r.width,height:r.height,type});
      };
      for(const a of annotations.filter(a=>a.filePath===docPath&&a.page===page&&a.type!=='ink')) {
        if(a.pdfRects?.length&&viewport) {
          for(const rect of a.pdfRects){const [x1,y1,x2,y2]=viewport.convertToViewportRectangle(rect);result.push({left:Math.min(x1,x2),top:Math.min(y1,y2),width:Math.abs(x2-x1),height:Math.abs(y2-y1),type:a.type});}
        }else{
          const start=findQuote(text,a.quote||'',a.start||0);if(start>=0&&a.quote)addRange(start,start+a.quote.length,a.type);
        }
      }
      for(const m of matchingOffsets(text,query))addRange(m.start,m.end,'search');
      // Read-along: the sentence being spoken, and the current word within it.
      if(speech&&speech.page===page&&speech.path===docPath){
        addRange(speech.start,speech.end,'speech');
        if(speech.word)addRange(speech.word.start,speech.word.end,'speech-word');
      }
      setRects(result);
    };
    draw();const observer=new ResizeObserver(draw);observer.observe(root);
    return()=>observer.disconnect();
  },[annotations,query,speech,docPath,page,ready,viewport,layoutKey,rootRef]);
  return <div aria-hidden="true" style={{position:'absolute',inset:0,pointerEvents:'none',zIndex:4}}>{rects.map((r,i)=><div key={i} data-decoration={r.type} style={{position:'absolute',left:r.left,top:r.top,width:r.width,height:r.height,
    background:r.type==='speech-word'?'rgba(255,214,0,.55)':r.type==='speech'?'rgba(79,195,247,.16)':r.type==='search'?'rgba(255,153,0,.45)':r.type?.startsWith('hl-')?colors[r.type.slice(3)]:r.type==='note'?'rgba(79,195,247,.22)':'transparent',
    borderBottom:r.type==='underline'?'2px solid #f48fb1':undefined,
  }}>{r.type==='strikethrough'&&<div style={{position:'absolute',top:'50%',width:'100%',borderTop:'2px solid #ef9a9a'}}/>}</div>)}</div>;
}
