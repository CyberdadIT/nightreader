import React,{useRef,useEffect,useState} from 'react';
import {useStore} from '../store/useStore.js';
import TextDecorations from './TextDecorations.jsx';
export default function EpubChapter({book,page}) {
  const ref=useRef(null),[ready,setReady]=useState(false);
  const font=useStore(s=>s.font),size=useStore(s=>s.fontSize),line=useStore(s=>s.lineHeight),margin=useStore(s=>s.margin),mode=useStore(s=>s.readingMode);
  const html=book.chapters[page-1]?.html||'';
  useEffect(()=>{setReady(true);},[html]);
  const light=mode==='light'||mode==='sepia';
  return <article className="epubChapter" data-page={page} style={{position:'relative',width:'100%',maxWidth:850,background:light?(mode==='sepia'?'#f0e6c8':'#fafafa'):'#161b22',color:light?'#222':'#e6edf3',padding:margin,borderRadius:8}}>
    <div ref={ref} data-text-root data-page-number={page} style={{position:'relative',fontFamily:`var(--font-${font==='mono'?'mono':font==='sans'?'sans':'serif'})`,fontSize:size,lineHeight:line}} onClick={e=>{
      const link=e.target.closest('a');const href=link?.getAttribute('href');if(!href?.startsWith('#book:'))return;
      e.preventDefault();const [path,anchor]=href.slice(6).split('#');const index=book.chapters.findIndex(c=>c.path===path);
      if(index>=0){useStore.getState().setCurrentPage(index+1);if(anchor)setTimeout(()=>document.getElementById(anchor)?.scrollIntoView(),50);}
    }}>
      <div dangerouslySetInnerHTML={{__html:html}}/>
      <TextDecorations rootRef={ref} ready={ready} page={page} layoutKey={`${size}:${line}:${margin}:${font}:${page}`}/>
    </div>
  </article>;
}
