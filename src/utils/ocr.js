import {createWorker} from 'tesseract.js';
import {saveOcrPage} from './storage.js';
import {prepareOcrLanguage,VERIFIED_CACHE_PATH} from './ocrLanguages.js';
export async function createOcrWorker(onProgress,language='eng') {
  const base=new URL(`${import.meta.env.BASE_URL}ocr/`,window.location.origin).href;
  const common={workerPath:`${base}worker.min.js`,corePath:base,langPath:base,workerBlobURL:false,logger:info=>onProgress?.(info)};
  if(language==='eng')return createWorker('eng',1,common);
  // Other languages: a downloaded, checksum-verified pack, read from cache only (never fetched by the worker).
  await prepareOcrLanguage(language);
  const worker=await createWorker(language,1,{...common,cachePath:VERIFIED_CACHE_PATH,cacheMethod:'readOnly'});
  worker.language=language;
  return worker;
}
export async function recognizePage(worker,doc,pageNumber) {
  const page=await doc.getPage(pageNumber),native=await page.getTextContent();
  if(native.items.some(item=>item.str?.trim()))return {skipped:true};
  const base=page.getViewport({scale:1}),scale=Math.min(2,Math.sqrt(5_000_000/(base.width*base.height)));
  const vp=page.getViewport({scale}),canvas=document.createElement('canvas');
  canvas.width=Math.ceil(vp.width);canvas.height=Math.ceil(vp.height);
  try {
    await page.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise;
    const {data}=await worker.recognize(canvas,{}, {text:true,blocks:true});
    const words=(data.blocks||[]).flatMap(b=>b.paragraphs||[]).flatMap(p=>p.lines||[]).flatMap(l=>l.words||[]).map(w=>({text:w.text,pdfRect:[...vp.convertToPdfPoint(w.bbox.x0,w.bbox.y0),...vp.convertToPdfPoint(w.bbox.x1,w.bbox.y1)]}));
    const result={text:data.text,words,confidence:data.confidence,language:worker.language||'eng'};
    // Text recognised from a password-protected PDF never leaves memory.
    if(doc.passwordProtected)doc.ocrMemory.set(pageNumber,result);else await saveOcrPage(doc.documentId,pageNumber,result);
    return result;
  }finally{canvas.width=0;canvas.height=0;}
}
