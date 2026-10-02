import React,{useEffect,useRef,useState} from 'react';
import {TextLayer,AnnotationLayer} from 'pdfjs-dist';
import {createLinkService} from '../utils/pdfLinks.js';
import {useStore} from '../store/useStore.js';
import {loadOcrPage} from '../utils/storage.js';
import {fitScale} from '../utils/annotations.js';
import TextDecorations from './TextDecorations.jsx';
import InkLayer from './InkLayer.jsx';
export default function PdfPage({pdf,pageNumber,availableWidth,availableHeight,scrollRoot}) {
  const boxRef=useRef(null),canvasRef=useRef(null),textRef=useRef(null),annotRef=useRef(null);
  const [near,setNear]=useState(false),[page,setPage]=useState(null),[ready,setReady]=useState(false),[ocr,setOcr]=useState(null),[error,setError]=useState('');
  const fit=useStore(s=>s.fitMode),zoom=useStore(s=>s.zoom),rotation=useStore(s=>s.rotation),mode=useStore(s=>s.readingMode),invert=useStore(s=>s.invertColors),version=useStore(s=>s.ocrVersion);
  const base=page?.getViewport({scale:1,rotation:((page.rotate||0)+rotation)%360});
  const fallback=rotation%180?{width:792,height:612}:{width:612,height:792};
  const scale=fitScale(base?.width||fallback.width,base?.height||fallback.height,availableWidth,availableHeight,fit,zoom);
  const viewport=page?.getViewport({scale,rotation:((page.rotate||0)+rotation)%360});
  const width=viewport?.width||fallback.width*scale,height=viewport?.height||fallback.height*scale;
  useEffect(()=>{
    const observer=new IntersectionObserver(([entry])=>setNear(entry.isIntersecting),{root:scrollRoot.current,rootMargin:'600px 0px'});
    observer.observe(boxRef.current);return()=>observer.disconnect();
  },[scrollRoot]);
  useEffect(()=>{
    if(!near)return;let cancelled=false;
    pdf.getPage(pageNumber).then(p=>{if(!cancelled)setPage(p);}).catch(e=>{if(!cancelled)setError(e.message);});
    return()=>{cancelled=true;};
  },[pdf,pageNumber,near]);
  useEffect(()=>{
    if(!near)return;let cancelled=false;
    (pdf.loadOcr?pdf.loadOcr(pageNumber):loadOcrPage(pdf.documentId,pageNumber)).then(data=>{if(!cancelled)setOcr(data||null);}).catch(()=>{});
    return()=>{cancelled=true;};
  },[pdf,pageNumber,near,version]);
  useEffect(()=>{
    const canvas=canvasRef.current,root=textRef.current,annot=annotRef.current;
    setReady(false);if(!canvas||!root)return;
    root.innerHTML='';if(annot)annot.innerHTML='';
    if(!near||!page){canvas.width=0;canvas.height=0;return;}
    let cancelled=false,task=null,layer=null;
    const vp=page.getViewport({scale,rotation:((page.rotate||0)+rotation)%360});
    root._pdfViewport=vp;root.style.setProperty('--scale-factor',String(scale));
    (async()=>{
      try {
        // Bound pixel allocation on high-DPI phones and 4K screens.
        const dpr=Math.min(window.devicePixelRatio||1,2,Math.sqrt(8_000_000/(vp.width*vp.height)));
        canvas.width=Math.floor(vp.width*dpr);canvas.height=Math.floor(vp.height*dpr);
        task=page.render({canvasContext:canvas.getContext('2d'),viewport:vp,transform:[dpr,0,0,dpr,0,0]});
        await task.promise;if(cancelled)return;
        const content=await page.getTextContent();if(cancelled)return;
        if(ocr?.words?.length&&!content.items.some(i=>i.str?.trim())) {
          for(const word of ocr.words) {
            const [x1,y1,x2,y2]=vp.convertToViewportRectangle(word.pdfRect);
            const span=document.createElement('span');span.textContent=word.text+' ';
            span.style.cssText=`left:${Math.min(x1,x2)}px;top:${Math.min(y1,y2)}px;font-size:${Math.abs(y2-y1)}px;font-family:Arial;line-height:1;`;
            root.append(span);
          }
        }else{
          layer=new TextLayer({textContentSource:content,container:root,viewport:vp});await layer.render();
        }
        // Links and form fields. Values typed into forms live in the document's
        // annotation storage until it's closed; "Save filled copy" writes them out.
        if(annot&&!cancelled){
          const annotations=await page.getAnnotations({intent:'display'});if(cancelled)return;
          if(annotations.length){
            pdf.linkService??=createLinkService(pdf);
            const avp=vp.clone({dontFlip:true});
            const al=new AnnotationLayer({div:annot,accessibilityManager:null,annotationCanvasMap:null,annotationEditorUIManager:null,page,viewport:avp,structTreeLayer:null});
            await al.render({viewport:avp,div:annot,annotations,page,linkService:pdf.linkService,annotationStorage:pdf.annotationStorage,renderForms:true,enableScripting:false,hasJSActions:false,fieldObjects:null,imageResourcesPath:''});
          }
        }
        if(!cancelled)setReady(true);
      }catch(e){if(!cancelled&&e.name!=='RenderingCancelledException')setError(e.message);}
    })();
    return()=>{cancelled=true;task?.cancel();layer?.cancel();canvas.width=0;canvas.height=0;root.innerHTML='';if(annot)annot.innerHTML='';};
  },[page,near,scale,rotation,ocr]);
  const filters={dark:'brightness(.8)',light:'none',sepia:'sepia(.5)',amoled:'brightness(.45)',green:'sepia(1) hue-rotate(65deg)',night:'brightness(.8) saturate(.9)',nightContrast:'contrast(1.45)',twilight:'sepia(.2) hue-rotate(240deg)',console:'sepia(.8) brightness(.75)'};
  return <div ref={boxRef} data-page={pageNumber} data-scale={scale} style={{'--scale-factor':scale,width,height,position:'relative',flexShrink:0,background:'#fff',boxShadow:'0 3px 20px #0008',overflow:'hidden'}}>
    <canvas ref={canvasRef} style={{width,height,display:'block',filter:invert?'invert(1) hue-rotate(180deg)':filters[mode]||'none'}}/>
    <div ref={textRef} className="textLayer" data-text-root data-page-number={pageNumber} style={{width,height}} aria-label={`Page ${pageNumber} text`}/>
    <div ref={annotRef} className="annotationLayer" style={{position:'absolute',inset:0,zIndex:3}}/>
    <TextDecorations rootRef={textRef} ready={ready} page={pageNumber} viewport={viewport} layoutKey={`${scale}:${rotation}`} docPath={pdf.documentId}/>
    {near&&<InkLayer pageNumber={pageNumber} viewport={viewport} filePath={pdf.documentId} scrollRoot={scrollRoot}/>}
    {error&&<p role="alert" style={{position:'absolute',top:20,left:20,color:'#900'}}>{error}</p>}
  </div>;
}
